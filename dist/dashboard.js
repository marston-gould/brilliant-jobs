// === js/globals.js ===
// ============================================================
// GLOBALS — Shared state across all dashboard modules
// Must load before all other JS modules
// ============================================================

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// PostHog analytics (A13)
window.POSTHOG_API_KEY = 'phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Auth
let currentUser = null;

// ============================================================
// USER DATA SYNC — localStorage ↔ Supabase profiles.user_data
// ============================================================
// Maps short keys to localStorage keys
const UD_KEYS = {
  saved_filters: 'bj_saved_filters',
  resumes: 'bj_resumes',
  pipeline_meta: 'bj_pipeline_meta',
  tuning: 'bj_tuning',
  saved_jobs: 'bj_saved_jobs',
  applied_jobs: 'bj_applied_jobs',
  applied_dates: 'bj_applied_dates',
  hidden_jobs: 'bj_hidden_jobs',
  app_queue: 'bj_app_queue',
  app_history: 'bj_app_history',
  readiness: 'bj_readiness'
};
const UD_LS_TO_SHORT = Object.fromEntries(Object.entries(UD_KEYS).map(([k,v]) => [v, k]));

// Debounce timer for batched Supabase writes
let _udSyncTimer = null;
let _udPendingKeys = new Set();

/**
 * Save user data to localStorage AND queue Supabase sync.
 * Drop-in replacement for localStorage.setItem('bj_X', JSON.stringify(val)).
 * @param {string} lsKey - Full localStorage key (e.g. 'bj_saved_filters')
 * @param {string} jsonStr - JSON string to save
 */
function saveUserData(lsKey, jsonStr) {
  localStorage.setItem(lsKey, jsonStr);
  const shortKey = UD_LS_TO_SHORT[lsKey];
  if (shortKey && currentUser) {
    _udPendingKeys.add(shortKey);
    clearTimeout(_udSyncTimer);
    _udSyncTimer = setTimeout(_flushUserData, 2000);
  }
}

/** Flush all pending keys to Supabase in one PATCH */
async function _flushUserData() {
  if (!currentUser || _udPendingKeys.size === 0) return;
  const patch = {};
  for (const key of _udPendingKeys) {
    const lsKey = UD_KEYS[key];
    try { patch[key] = JSON.parse(localStorage.getItem(lsKey) || 'null'); }
    catch { patch[key] = null; }
  }
  _udPendingKeys.clear();
  try {
    const { error } = await sb.from('profiles')
      .update({ user_data: sb.rpc ? undefined : undefined }) // placeholder
      .eq('id', currentUser.id);
    // Use raw PATCH to merge into JSONB (not overwrite entire column)
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_data: Object.assign(
        JSON.parse(localStorage.getItem('_bj_ud_cache') || '{}'),
        patch
      )})
    });
    // Update local cache of full user_data
    const cached = JSON.parse(localStorage.getItem('_bj_ud_cache') || '{}');
    Object.assign(cached, patch);
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cached));
    console.log('[sync] Flushed', Object.keys(patch).join(', '));
  } catch (e) {
    console.warn('[sync] Flush error:', e.message);
  }
}

/**
 * Load user data from Supabase on login. Merges with localStorage:
 * - Supabase wins if localStorage is empty for that key
 * - localStorage wins if Supabase is empty (first sync / migration)
 * - After merge, syncs back to Supabase
 */
async function loadUserData(userId) {
  try {
    const { data, error } = await sb.from('profiles')
      .select('user_data')
      .eq('id', userId)
      .single();
    if (error || !data?.user_data) {
      console.log('[sync] No cloud data, will sync localStorage up on next save');
      return;
    }
    const cloud = data.user_data;
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cloud));
    let needsSync = false;
    for (const [shortKey, lsKey] of Object.entries(UD_KEYS)) {
      const cloudVal = cloud[shortKey];
      const localVal = localStorage.getItem(lsKey);
      const localParsed = localVal ? JSON.parse(localVal) : null;
      const cloudEmpty = cloudVal == null || (Array.isArray(cloudVal) && cloudVal.length === 0) || (typeof cloudVal === 'object' && !Array.isArray(cloudVal) && Object.keys(cloudVal).length === 0);
      const localEmpty = localParsed == null || (Array.isArray(localParsed) && localParsed.length === 0) || (typeof localParsed === 'object' && !Array.isArray(localParsed) && Object.keys(localParsed).length === 0);

      if (!cloudEmpty && localEmpty) {
        // Cloud has data, local doesn't → pull from cloud
        localStorage.setItem(lsKey, JSON.stringify(cloudVal));
        console.log('[sync] Pulled', shortKey, 'from cloud');
      } else if (cloudEmpty && !localEmpty) {
        // Local has data, cloud doesn't → queue sync up
        needsSync = true;
        _udPendingKeys.add(shortKey);
      }
      // Both have data → local wins (user's current machine is source of truth)
    }
    if (needsSync) {
      console.log('[sync] Local data needs upload:', [..._udPendingKeys].join(', '));
      _flushUserData();
    }
  } catch (e) {
    console.warn('[sync] Load error:', e.message);
  }
}

// ============================================================
// ENTITLEMENT SYSTEM — Cohort-aware feature gating
// Calls check_entitlement() RPC with client-side caching
// ============================================================

var _entitlementCache = {};
var _entitlementCacheTTL = 5 * 60 * 1000; // 5 min cache

/**
 * Check if user can use a feature. Returns { allowed, effective_limit, remaining, behavior, ... }
 * @param {string} feature - Feature ID (e.g. 'filters', 'resumes', 'resume_grading')
 * @param {number} [usageCount=0] - Current usage count to check against
 * @returns {Promise<object>} Entitlement result from server
 */
async function checkEntitlement(feature, usageCount) {
  if (!currentUser) return { allowed: false, behavior: 'off', effective_limit: 0, remaining: 0 };
  if (typeof usageCount === 'undefined') usageCount = 0;
  var cacheKey = feature + ':' + usageCount;
  var cached = _entitlementCache[cacheKey];
  if (cached && Date.now() - cached._ts < _entitlementCacheTTL) return cached;
  try {
    var { data, error } = await sb.rpc('check_entitlement', {
      p_user_id: currentUser.id,
      p_feature: feature,
      p_usage_count: usageCount
    });
    if (error) { console.warn('[entitlement]', feature, error.message); return { allowed: true, behavior: 'fixed', effective_limit: 99, remaining: 99 }; }
    data._ts = Date.now();
    _entitlementCache[cacheKey] = data;
    return data;
  } catch (e) {
    console.warn('[entitlement] Error:', e.message);
    return { allowed: true, behavior: 'fixed', effective_limit: 99, remaining: 99 };
  }
}

/** Clear entitlement cache (call after usage changes) */
function clearEntitlementCache(feature) {
  if (feature) {
    Object.keys(_entitlementCache).forEach(function(k) { if (k.startsWith(feature + ':')) delete _entitlementCache[k]; });
  } else {
    _entitlementCache = {};
  }
}

/**
 * Show upgrade prompt when a feature is gated.
 * @param {string} featureName - Human-readable feature name
 * @param {object} ent - Entitlement result from checkEntitlement()
 * @returns {boolean} true if blocked (caller should abort)
 */
function showUpgradePrompt(featureName, ent) {
  var msg = ent.behavior === 'off'
    ? featureName + ' is a Pro feature. Upgrade to unlock it.'
    : 'You\'ve reached the ' + featureName + ' limit (' + ent.effective_limit + '). Upgrade to Pro for more.';
  // Create a toast-style notification
  var toast = document.createElement('div');
  toast.className = 'upgrade-toast';
  toast.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3L10 14.5 5.1 17l.9-5.3-4-3.9 5.5-.8z" fill="var(--accent)"/></svg>' +
    '<div><div style="font-weight:600;color:var(--text);font-size:13px;">' + msg + '</div>' +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Go to Settings → Subscription to upgrade.</div></div>' +
    '</div>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 4000);
  return true;
}

// Saved filters
var savedFilters = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

// Tuning state (refined by tuning.js when it loads)
var tuningSettings = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
var tuningLocExclPills = tuningSettings.locationExcludes || [];
var tuningTitleExclPills = tuningSettings.titleExcludes || [];
var tuningCoExclPills = tuningSettings.companyExcludes || [];
var tuningIndExclPills = tuningSettings.industryExcludes || [];
var levelHierarchy = tuningSettings.levelHierarchy || [];
// Stub — overridden by tuning.js with full implementation
// getJobLevel — provided by tuning.js (do not stub here, var assignment kills function declaration hoisting)

// Pill arrays (used by query-builder.js, location.js, browsers.js)
var whatPills = [];
var wherePills = [];
var whenPills = [];
var whoPills = [];
var payPills = [];
var whatNotPills = [];
var whereNotPills = [];
var whoNotPills = [];
var WORKPLACE_WORDS = ['remote','hybrid','onsite','on-site','in-office'];
var SALARY_RE = /^\$?\d{2,3}k?\+?$/i;
var DEFAULT_RADIUS = 30;

// Job feed state
var allJobs = [];
var currentJobs = [];
var jobSortStack = [{ field: 'updated_at', asc: false }];
var hiddenJobIds = JSON.parse(localStorage.getItem('bj_hidden_jobs') || '[]');
var savedJobIds = JSON.parse(localStorage.getItem('bj_saved_jobs') || '[]');
var appliedJobIds = JSON.parse(localStorage.getItem('bj_applied_jobs') || '[]');
var searchTimeout = null;
var currentJobPage = 0;
var JOBS_PER_PAGE = 50;

// Resume state (populated fully in resumes.js)
var resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');

// Shared filter color palette (10 colors for numbered filter badges)
var filterColors = ['#6366f1','#f59e0b','#ec4899','#22c55e','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6','#a855f7'];

/**
 * Enrich a job via Edge Function (service_role writes).
 * Replaces direct sb.from('ats_jobs').update() calls blocked by RLS.
 * @param {string} jobId - greenhouse_id
 * @param {object} data - { content?: string, salary?: { min, max, raw, currency, rate } }
 */
async function enrichJob(jobId, data) {
  try {
    // Use anon key directly — Edge Function uses service_role internally for writes.
    // Previously used session access_token which caused 401s when JWT expired.
    const resp = await fetch(SUPABASE_URL + '/functions/v1/enrich-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ job_id: jobId, ...data })
    });
    if (!resp.ok) console.warn('[enrich-job] Failed for', jobId, resp.status);
  } catch (e) {
    console.warn('[enrich-job] Error:', e.message);
  }
}


// === js/query-builder.js ===
// ============================================================
// JOBS — TAG QUERY BUILDER
// ============================================================
// Each pill is { values: ['term1','term2'], type: 'keyword'|'salary'|'type'|'location' }
// whatPills = keyword/salary/type pills, wherePills = location pills
// Multiple values in one pill = OR, multiple pills = AND

function classifyTerm(term) {
  const lower = term.toLowerCase().trim();
  if (WORKPLACE_WORDS.includes(lower.replace('-',''))) return 'type';
  if (SALARY_RE.test(lower) || /^\d{4,}$/.test(lower)) return 'salary';
  return 'keyword';
}

function allPills() { return whatPills.length + wherePills.length + whenPills.length + whoPills.length + payPills.length + whatNotPills.length + whereNotPills.length + whoNotPills.length; }

function renderPillsFor(pillArray, builderId, inputId, isLocation, extraClass, onRemove) {
  const builder = $(builderId);
  builder.querySelectorAll('.qb-pill, .qb-and').forEach(el => el.remove());
  const input = $(inputId);

  const isNot = extraClass && extraClass.includes('not-pill');
  const sepLabel = isNot ? 'AND' : 'or';

  pillArray.forEach((pill, i) => {
    if (i > 0) {
      const andEl = document.createElement('span');
      andEl.className = 'qb-and';
      andEl.textContent = sepLabel;
      builder.insertBefore(andEl, input);
    }

    const el = document.createElement('span');
    let cls = 'qb-pill';
    if (pill.type === 'collection') cls += ' collection-pill';
    else if (extraClass) cls += ' ' + extraClass;
    else if (isLocation) cls += ' location-pill';
    else if (pill.values.length > 1) cls += ' or-group';
    else if (pill.type === 'salary') cls += ' salary-pill';
    else if (pill.type === 'type') cls += ' type-pill';
    el.className = cls;

    const isNot = extraClass && extraClass.includes('not-pill');
    const orLabel = isNot ? ' nor ' : ' or ';
    const isMulti = pill.values.length > 1 && pill.type !== 'collection';

    let display;
    if (pill.type === 'collection') {
      display = `📂 ${pill.collectionName}<span class="coll-count">(${pill.values.length})</span>`;
    } else if (isMulti) {
      // Multi-value: each value gets its own × button
      const parts = pill.values.map((v, vi) => {
        let valHtml = `<span class="qb-val-item" data-pill="${i}" data-val="${vi}">`;
        valHtml += `<span class="qb-val-text">${v}</span>`;
        valHtml += `<span class="qb-val-remove" data-pill="${i}" data-val="${vi}" title="Remove '${v.replace(/'/g,'&#39;')}'">×</span>`;
        valHtml += `</span>`;
        return valHtml;
      });
      // Location badge
      let badge = '';
      if (isLocation) {
        if (pill.locType === 'state') badge = `<span class="pill-radius" style="color:#8b5cf6;">state</span>`;
        else if (pill.locType === 'metro') badge = `<span class="pill-radius" style="color:#f59e0b;">${Math.round(pill.radius_mi)}mi</span>`;
        else if (pill.radius_mi) badge = `<span class="pill-radius">${Math.round(pill.radius_mi)}mi</span>`;
      }
      display = parts.join(`<span class="or-sep">${orLabel}</span>`) + badge;
    } else if (isLocation) {
      const textParts = pill.values.map(v => `<span>${v}</span>`);
      const joined = textParts[0];
      let badge = '';
      if (pill.locType === 'state') badge = `<span class="pill-radius" style="color:#8b5cf6;">state</span>`;
      else if (pill.locType === 'metro') badge = `<span class="pill-radius" style="color:#f59e0b;">${Math.round(pill.radius_mi)}mi</span>`;
      else if (pill.radius_mi) badge = `<span class="pill-radius">${Math.round(pill.radius_mi)}mi</span>`;
      display = `${joined}${badge}`;
    } else {
      display = `<span>${pill.values[0]}</span>`;
    }

    el.innerHTML = `<span class="qb-pill-text" data-idx="${i}">${display}</span><span class="qb-pill-remove" data-idx="${i}">×</span>`;
    builder.insertBefore(el, input);
  });

  // Bind per-value remove buttons (for multi-value pills)
  builder.querySelectorAll('.qb-val-remove').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const pi = parseInt(el.dataset.pill);
      const vi = parseInt(el.dataset.val);
      if (pillArray[pi]) {
        pillArray[pi].values.splice(vi, 1);
        // If only 0 values left, remove the pill entirely
        if (pillArray[pi].values.length === 0) {
          pillArray.splice(pi, 1);
        }
        if (onRemove) onRemove();
        else renderAllPills();
      }
    });
  });

  // Bind pill text click — add OR term inline (only for location/collection pills)
  builder.querySelectorAll('.qb-pill-text').forEach(el => {
    el.addEventListener('click', e => {
      // If they clicked a per-value remove, don't open input
      if (e.target.classList.contains('qb-val-remove')) return;

      const idx = parseInt(el.dataset.idx);
      const pill = pillArray[idx];

      // Collection pills open the edit popup
      if (pill && pill.type === 'collection') {
        openCollectionPopup(pill, pillArray, idx);
        return;
      }

      // Only location pills get inline OR input
      if (!isLocation) return;

      const existing = builder.querySelector('.qb-or-input');
      if (existing) existing.remove();
      const orInput = document.createElement('input');
      orInput.type = 'text';
      orInput.className = 'qb-input qb-or-input';
      orInput.style.maxWidth = '140px';
      orInput.placeholder = isLocation ? 'or city…' : 'or …';
      orInput.dataset.targetIdx = idx;
      const pillEl = el.closest('.qb-pill');
      pillEl.after(orInput);
      orInput.focus();
      orInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') {
          const val = orInput.value.trim();
          if (val) {
            pillArray[idx].values.push(val);
          }
          orInput.remove();
          renderAllPills();
        }
        if (ev.key === 'Escape') { orInput.remove(); }
      });
      orInput.addEventListener('blur', () => { orInput.remove(); });
    });
  });

  // Bind pill-level remove (removes entire pill group)
  builder.querySelectorAll('.qb-pill-remove').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      pillArray.splice(parseInt(el.dataset.idx), 1);
      if (onRemove) onRemove();
      else renderAllPills();
    });
  });
}

function renderAllPills() {
  renderPillsFor(whatPills, '#query-builder-what', '#qb-input-what', false, '');
  renderPillsFor(whatNotPills, '#query-builder-what-not', '#qb-input-what-not', false, 'not-pill');
  renderPillsFor(wherePills, '#query-builder-where', '#qb-input-where', true, '');
  renderPillsFor(whereNotPills, '#query-builder-where-not', '#qb-input-where-not', false, 'not-pill');
  renderPillsFor(whenPills, '#query-builder-when', '#qb-input-when', false, 'when-pill');
  renderPillsFor(whoPills, '#query-builder-who', '#qb-input-who', false, 'who-pill');
  renderPillsFor(whoNotPills, '#query-builder-who-not', '#qb-input-who-not', false, 'not-pill');
  renderPayPills();

  // Show/hide toolbar
  const hasAny = allPills() > 0;
  $('#save-filter-row').style.display = hasAny ? 'inline-flex' : 'none';
  $('#clear-filters-btn').style.display = hasAny ? '' : 'none';
  // Always show saved filters if any exist
  $('#saved-filters-section').style.display = savedFilters.length > 0 ? '' : 'none';

  // Update collapse badge count
  const count = allPills();
  const badge = $('#qb-active-count');
  if (count > 0) { badge.textContent = count + ' filter' + (count > 1 ? 's' : ''); badge.style.display = ''; }
  else { badge.style.display = 'none'; }

  // Trigger job search when filters change (only from filter builder)
  if (allPills() > 0) debouncedSearchJobs();
}



// === js/job-feed.js ===
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



// === js/sort-bar.js ===
// ============================================================
// SORT BAR — Visible multi-sort with numbered pills
// ============================================================

function renderSortPills() {
  const container = $('#sort-pills');
  container.innerHTML = '';
  // Color map matching filter row colors: title=blue, company=pink, location=amber, salary=green, days=purple, ghost=red
  const sortColorMap = {
    title: { bg: 'rgba(61,126,255,0.1)', text: 'var(--accent)', dot: 'var(--accent)' },
    company_name: { bg: 'rgba(236,72,153,0.1)', text: '#ec4899', dot: '#ec4899' },
    location: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', dot: '#f59e0b' },
    updated_at: { bg: 'rgba(168,85,247,0.1)', text: '#a855f7', dot: '#a855f7' },
    level: { bg: 'rgba(6,182,212,0.1)', text: '#06b6d4', dot: '#06b6d4' },
  };
  jobSortStack.forEach((s, i) => {
    const labelMap = { updated_at: 'Days', title: 'Title', company_name: 'Company', location: 'Location', level: 'Level' };
    const label = labelMap[s.field] || s.field;
    const dirLabel = s.asc ? '↑' : '↓';
    const dirTitle = s.asc
      ? (s.field === 'updated_at' ? 'Oldest first — click to flip' : s.field === 'level' ? 'Lowest first — click to flip' : 'A→Z — click to flip')
      : (s.field === 'updated_at' ? 'Newest first — click to flip' : s.field === 'level' ? 'Highest first — click to flip' : 'Z→A — click to flip');
    const colors = sortColorMap[s.field] || sortColorMap.title;

    const pill = document.createElement('span');
    pill.className = 'sort-pill';
    pill.style.background = colors.bg;
    pill.style.color = colors.text;
    pill.innerHTML = `
      <span class="sort-num" style="background:${colors.dot};">${i + 1}</span>
      ${label}
      <span class="sort-dir" title="${dirTitle}" data-idx="${i}">${dirLabel}</span>
      <span class="sort-remove" title="Remove" data-idx="${i}">✕</span>
    `;
    container.appendChild(pill);
  });

  // Bind direction toggle
  container.querySelectorAll('.sort-dir').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      jobSortStack[idx].asc = !jobSortStack[idx].asc;
      renderSortPills();
      searchJobs(0);
    });
  });

  // Bind remove
  container.querySelectorAll('.sort-remove').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      jobSortStack.splice(idx, 1);
      if (jobSortStack.length === 0) jobSortStack.push({ field: 'updated_at', asc: false });
      renderSortPills();
      searchJobs(0);
    });
  });

  // Update dropdown — disable already-used fields
  $$('#sort-dropdown .sort-opt').forEach(opt => {
    const inUse = jobSortStack.some(s => s.field === opt.dataset.field);
    opt.classList.toggle('disabled', inUse);
  });
}

// Sort add button + dropdown
$('#sort-add-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = $('#sort-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
});

$$('#sort-dropdown .sort-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const field = opt.dataset.field;
    if (jobSortStack.some(s => s.field === field)) return;
    const defaultAsc = field === 'title' || field === 'company_name' || field === 'location';
    jobSortStack.push({ field, asc: field === 'level' ? false : defaultAsc });
    $('#sort-dropdown').style.display = 'none';
    renderSortPills();
    searchJobs(0);
  });
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sort-add-wrap')) {
    $('#sort-dropdown').style.display = 'none';
  }
});

// Also allow clicking table headers as a quick single-sort shortcut
$$('.job-table th[data-sort]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    const fieldMap = { title: 'title', company: 'company_name', location: 'location', days: 'updated_at', level: 'level', match: 'match', salary: 'salary_max', ghost: 'ghost_rate' };
    const dbField = fieldMap[field] || 'updated_at';

    // If already primary sort, toggle direction
    if (jobSortStack.length > 0 && jobSortStack[0].field === dbField) {
      jobSortStack[0].asc = !jobSortStack[0].asc;
    } else {
      // Make it the primary sort (keep others)
      jobSortStack = jobSortStack.filter(s => s.field !== dbField);
      jobSortStack.unshift({ field: dbField, asc: field === 'title' || field === 'company' || field === 'location' });
    }
    renderSortPills();
    searchJobs(0);
  });
});

// Initial render of sort pills
renderSortPills();

// Input handling — What row
const qbInputWhat = $('#qb-input-what');
function commitPill(input, pillArray, makePill) {
  const raw = input.value.trim().toLowerCase();
  if (!raw) return false;
  pillArray.push(makePill(raw));
  input.value = '';
  renderAllPills();
  return true;
}

const qbInputOrder = ['qb-input-what', 'qb-input-where', 'qb-input-when', 'qb-input-who', 'qb-input-pay-min'];

function focusNextInput(currentId) {
  const idx = qbInputOrder.indexOf(currentId);
  if (idx >= 0 && idx < qbInputOrder.length - 1) {
    const next = $('#' + qbInputOrder[idx + 1]);
    if (next) setTimeout(() => next.focus(), 10);
  }
}

qbInputWhat.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }));
  } else if (e.key === 'Tab') {
    if (qbInputWhat.value.trim()) {
      e.preventDefault();
      commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }));
      focusNextInput('qb-input-what');
    }
  } else if (e.key === 'Backspace' && qbInputWhat.value === '' && whatPills.length > 0) {
    whatPills.pop();
    renderAllPills();
  }
});
qbInputWhat.addEventListener('blur', () => {
  commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }));
});

// Input handling — Where row (handled by location autocomplete section below)

// Click builders to focus respective inputs
$('#query-builder-what').addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  qbInputWhat.focus();
});
$('#query-builder-where').addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  qbInputWhere.focus();
});
$('#query-builder-when').addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  $('#qb-input-when').focus();
});
$('#query-builder-who').addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  $('#qb-input-who').focus();
});

// Input handling — When row
const qbInputWhen = $('#qb-input-when');
qbInputWhen.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitPill(qbInputWhen, whenPills, raw => ({ values: [raw], type: 'when' }));
  } else if (e.key === 'Tab') {
    if (qbInputWhen.value.trim()) {
      e.preventDefault();
      commitPill(qbInputWhen, whenPills, raw => ({ values: [raw], type: 'when' }));
      focusNextInput('qb-input-when');
    }
  } else if (e.key === 'Backspace' && qbInputWhen.value === '' && whenPills.length > 0) {
    whenPills.pop();
    renderAllPills();
  }
});
qbInputWhen.addEventListener('blur', () => {
  commitPill(qbInputWhen, whenPills, raw => ({ values: [raw], type: 'when' }));
});

// Input handling — Who row
const qbInputWho = $('#qb-input-who');
qbInputWho.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
    // If dropdown is open, force selection from it
    if (companyDropdown.classList.contains('open')) {
      const first = companyDropdown.querySelector('.company-opt');
      if (first) {
        e.preventDefault();
        qbInputWho.value = first.dataset.name;
        commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
        renderAllPills();
        companyDropdown.classList.remove('open');
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',') e.preventDefault();
    commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
    companyDropdown.classList.remove('open');
  } else if (e.key === 'Backspace' && qbInputWho.value === '' && whoPills.length > 0) {
    whoPills.pop();
    renderAllPills();
  } else if (e.key === 'Escape') {
    companyDropdown.classList.remove('open');
  } else if (e.key === 'ArrowDown' && companyDropdown.classList.contains('open')) {
    e.preventDefault();
    const first = companyDropdown.querySelector('.company-opt');
    if (first) first.focus();
  }
});
qbInputWho.addEventListener('blur', () => {
  commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
  setTimeout(() => { $('#company-dropdown').classList.remove('open'); }, 200);
});

// Company autocomplete
let companySearchTimeout = null;
const companyDropdown = $('#company-dropdown');

qbInputWho.addEventListener('input', () => {
  const q = qbInputWho.value.trim();
  if (q.length < 2) { companyDropdown.classList.remove('open'); return; }
  clearTimeout(companySearchTimeout);
  companySearchTimeout = setTimeout(() => searchCompanies(q), 200);
});


async function searchCompanies(query) {
  const results = [];
  try {
    // Search ats_companies by slug or name
    const { data: atsData, error: atsErr } = await sb
      .from('ats_companies')
      .select('slug, name, source')
      .or(`slug.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(6);
    if (atsErr) console.warn('[BJ] ATS company search error:', atsErr.message);
    if (atsData) {
      atsData.forEach(c => results.push({
        name: c.name || c.slug, slug: c.slug, source: 'ats', ats: c.source || 'greenhouse'
      }));
    }
  } catch (e) { console.warn('[BJ] ATS company search failed:', e); }

  try {
    // Search user's connections by parsed_company
    const { data: connData, error: connErr } = await sb
      .from('connections')
      .select('parsed_company')
      .ilike('parsed_company', `%${query}%`)
      .not('parsed_company', 'is', null)
      .limit(30);
    if (connErr) console.warn('[BJ] Connection company search error:', connErr.message);
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
  } catch (e) { console.warn('[BJ] Connection company search failed:', e); }

  renderCompanyDropdown(results, query);
}

function renderCompanyDropdown(results, query) {
  if (results.length === 0) { companyDropdown.classList.remove('open'); return; }
  companyDropdown.innerHTML = results.map(r => {
    const badge = r.source === 'network'
      ? `<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">${r.connections} conn</span>`
      : `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.ats}</span>`;
    const hl = highlightCompanyMatch(r.name, query);
    return `<div class="company-opt" tabindex="0" data-name="${r.name.replace(/"/g, '&quot;')}">
      <span style="font-weight:500;">${hl}</span>${badge}</div>`;
  }).join('');
  companyDropdown.classList.add('open');

  companyDropdown.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur from firing first
      qbInputWho.value = opt.dataset.name;
      commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
      renderAllPills();
      companyDropdown.classList.remove('open');
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); opt.dispatchEvent(new Event('mousedown')); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else qbInputWho.focus(); }
      if (e.key === 'Escape') { companyDropdown.classList.remove('open'); qbInputWho.focus(); }
    });
  });
}

function highlightCompanyMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) +
    '<strong style="color:var(--accent);">' + text.slice(idx, idx + query.length) + '</strong>' +
    text.slice(idx + query.length);
}



// === js/keywords.js ===
// ============================================================
// KEYWORD EXTRACTION ENGINE (P4)
// ============================================================
const KW_STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','are','were',
  'be','been','being','have','has','had','do','does','did','will','would','shall','should','may','might','can',
  'could','must','need','this','that','these','those','it','its','we','our','you','your','they','their','he',
  'she','his','her','who','which','what','when','where','how','all','each','every','both','few','more','most',
  'other','some','such','no','not','only','own','same','so','than','too','very','just','about','above','after',
  'again','also','am','any','because','before','below','between','down','during','further','here','into','out',
  'over','then','there','through','under','until','up','while','if','or','nor','per','via','etc','ie','eg',
  'able','across','along','already','among','another','around','away','back','become','behind','best','better',
  'beyond','come','day','different','done','either','else','end','even','find','first','get','give','go','going',
  'good','great','help','high','however','including','keep','know','last','least','less','let','like','long',
  'look','made','make','many','much','new','next','now','number','off','often','old','one','onto','part',
  'people','place','point','put','right','say','see','set','show','since','small','still','take','tell',
  'thing','think','three','time','turn','two','us','use','used','using','want','way','well','without','work',
  'working','works','world','year','years','able','apply','applicants','application','applications',
  'candidate','candidates','company','companies','description','duties','employment','employer','equal',
  'experience','include','includes','including','information','job','jobs','location','opportunities',
  'opportunity','position','positions','qualifications','qualified','required','requirements','responsible',
  'role','roles','skills','team','teams','employees','status','provide','providing','related','may','within',
  'based','ensure','must','strong','support','ability','following','current','please','com','www','http','https',
  'will','nbsp','amp','quot','lt','gt','div','span','class','style','href','src','img','br','ul','ol','li',
  'strong','em','table','tr','td','th','p','h1','h2','h3','h4','h5','h6','section','header','footer',
  'width','height','color','background','font','size','margin','padding','border','display','align','text'
]);

// Industry/role terms that are too generic to be useful
const KW_GENERIC = new Set([
  'full','time','base','level','senior','junior','lead','manager','director','associate','staff','principal',
  'remote','hybrid','onsite','office','salary','range','bonus','benefits','paid','annual','competitive',
  'preferred','minimum','bachelor','master','degree','equivalent','plus','knowledge','understanding',
  'excellent','written','verbal','communication','organizational','proven','track','record','attention',
  'detail','self','starter','motivated','passion','passionate','fast','paced','environment','collaborative',
  'cross','functional','hands','ability','demonstrated','proficiency','proficient','familiarity','familiar',
  'deep','solid','relevant','direct','extensive','developing','developed','build','building','create',
  'creating','manage','managing','management','drive','driving','driven','deliver','delivering','lead',
  'leading','leadership','execute','execution','implement','implementing','implementation','define',
  'defining','establish','establishing','maintain','maintaining','optimize','optimizing','oversee',
  'overseeing','coordinate','coordinating','collaborate','collaborating','analyze','analyzing','identify',
  'identifying','develop','growth','report','reporting','reports','responsible','responsibilities',
  'looking','join','exciting',
  // EEO / legal boilerplate — appears in nearly every JD, not a real skill
  'race','color','religion','national','origin','sex','sexual','orientation','gender','identity',
  'age','disability','veteran','status','marital','citizenship','creed','ancestry','genetic',
  'pregnancy','ethnicity','expression','protected','discrimination','harassment','accommodation',
  'equal','opportunity','employer','affirmative','action','comply','compliance','prohibit',
  'diverse','diversity','inclusive','inclusion','equitable','equity','belonging',
  'applicant','applicants','qualified','regardless','offer','offers','offered',
  'mission','vision','values','culture','committed','commitment','believe','believes',
  'proud','invite','encouraged','welcome','welcomes','apply','consideration',
  // Generic job posting filler
  'company','team','work','working','role','position','job','hire','hiring','candidate','candidates',
  'experience','years','year','strong','great','good','best','new','well','high','key','part',
  'multiple','various','include','including','includes','required','requirements','qualifications',
  'also','may','must','shall','please','note','currently','within','across','ensure','support',
  'provide','help','take','make','use','using','used','need','needs','like','want','day'
]);

function stripHtmlToText(html) {
  if (!html) return '';
  // First pass: decode any double-encoded HTML entities
  let cleaned = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const doc = new DOMParser().parseFromString(cleaned, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

const KW_HTML_JUNK = new Set(['div','span','li','ul','ol','br','hr','td','tr','th','tbody','thead','table','strong','em','p','a','img','svg','path','h1','h2','h3','h4','h5','h6','nbsp','mdash','ndash','amp','quot','lt','gt','href','src','class','style','id','type','data','width','height']);

function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s\-\+\#\.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !/^\d+$/.test(w) && !KW_HTML_JUNK.has(w));
}

function extractNgrams(jobs, maxPerGroup = 40) {
  const uniCounts = {};
  const biCounts = {};
  const triCounts = {};
  let jobsWithContent = 0;

  for (const job of jobs) {
    const raw = job.content || job.description || '';
    if (!raw || isContentUnavailable(raw)) continue;
    jobsWithContent++;

    const text = stripHtmlToText(raw);
    const words = tokenize(text);

    // Track per-job uniqueness (count each term once per job, not per occurrence)
    const seenUni = new Set();
    const seenBi = new Set();
    const seenTri = new Set();

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // Unigrams
      if (!KW_STOPWORDS.has(w) && !KW_GENERIC.has(w) && w.length > 2) {
        if (!seenUni.has(w)) { uniCounts[w] = (uniCounts[w] || 0) + 1; seenUni.add(w); }
      }
      // Bigrams
      if (i < words.length - 1) {
        const bi = w + ' ' + words[i+1];
        if (!KW_STOPWORDS.has(w) && !KW_STOPWORDS.has(words[i+1]) && !seenBi.has(bi)) {
          biCounts[bi] = (biCounts[bi] || 0) + 1;
          seenBi.add(bi);
        }
      }
      // Trigrams
      if (i < words.length - 2) {
        const tri = w + ' ' + words[i+1] + ' ' + words[i+2];
        const ws = [w, words[i+1], words[i+2]];
        const stopCount = ws.filter(x => KW_STOPWORDS.has(x)).length;
        if (stopCount <= 1 && !seenTri.has(tri)) {
          triCounts[tri] = (triCounts[tri] || 0) + 1;
          seenTri.add(tri);
        }
      }
    }
  }

  // EEO and legal boilerplate bigrams/trigrams to exclude
  const EEO_PHRASES = new Set([
    'national origin','sexual orientation','gender identity','gender expression',
    'marital status','veteran status','disability status','citizenship status',
    'genetic information','equal opportunity','affirmative action','protected class',
    'protected veteran','race color','color religion','religion national',
    'age disability','pregnancy discrimination','reasonable accommodation',
    'equal employment','employment opportunity','regardless race','regardless gender',
    'diverse candidates','inclusive workplace','diversity equity','equity inclusion',
  ]);

  // Minimum threshold: must appear in at least 2 JDs (or 10% of jobs, whichever is higher)
  const minCount = Math.max(2, Math.ceil(jobsWithContent * 0.10));

  const sortAndFilter = (counts) => Object.entries(counts)
    .filter(([term, count]) => count >= minCount && !KW_GENERIC.has(term) && !EEO_PHRASES.has(term))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPerGroup);

  return {
    skills: sortAndFilter(uniCounts),
    bigrams: sortAndFilter(biCounts),
    trigrams: sortAndFilter(triCounts),
    jobsAnalyzed: jobsWithContent,
    totalJobs: jobs.length
  };
}


// ============================================================
// RESUME READINESS ANALYSIS (P4 v2)
// ============================================================
// Scores how well a resume covers the keywords in matching JDs
// for each assigned filter. Runs at the resume level, not the feed.

var jobMatchScores = {}; // greenhouse_id → score (0-100)
var readinessCache = JSON.parse(localStorage.getItem('bj_readiness') || 'null');
var filterCorpusCache = {}; // filterName → { skills: [[term,count],...], bigrams: [...] }
var readinessRunning = false;

function scoreToGrade(score) {
  if (score >= 90) return { grade: 'A+', color: 'var(--green)' };
  if (score >= 80) return { grade: 'A', color: 'var(--green)' };
  if (score >= 70) return { grade: 'B+', color: '#22c55e' };
  if (score >= 60) return { grade: 'B', color: 'var(--warm)' };
  if (score >= 50) return { grade: 'C+', color: 'var(--warm)' };
  if (score >= 40) return { grade: 'C', color: '#f97316' };
  if (score >= 30) return { grade: 'D', color: 'var(--red)' };
  return { grade: 'F', color: 'var(--red)' };
}

// Fetch up to `limit` JDs for a given saved filter
async function fetchFilterJDs(sf, limit) {
  limit = limit || 80;
  let query = sb.from('ats_jobs').select('greenhouse_id, title, content, company_slug, url');
  query = buildFilterQuery(sf, query, null);
  query = query.not('content', 'is', null);
  query = query.limit(limit);
  query = query.order('updated_at', { ascending: false });

  const { data, error } = await query;
  if (error) { console.log('[BJ] fetchFilterJDs error:', error.message); return []; }
  return data || [];
}

// Batch-fetch JD content from Greenhouse API for jobs missing it
async function batchFetchJDContent(jobs, maxFetch) {
  maxFetch = maxFetch || 30;
  var fetched = 0;
  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    if (job.content || fetched >= maxFetch) continue;
    // Only fetch from Greenhouse API — other ATS platforms don't support this endpoint
    if (job.ats_source && job.ats_source !== 'greenhouse') continue;
    try {
      var urlMatch = (job.url || '').match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
      if (!urlMatch && job.company_slug) urlMatch = [null, job.company_slug, job.greenhouse_id];
      if (!urlMatch) continue;
      var apiUrl = 'https://boards-api.greenhouse.io/v1/boards/' + urlMatch[1] + '/jobs/' + urlMatch[2];
      var resp = await fetch(apiUrl);
      if (resp.ok) {
        var data = await resp.json();
        if (data.content) {
          job.content = decodeJobContent(data.content);
          enrichJob(job.greenhouse_id, { content: job.content });
          fetched++;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        // Listing removed from ATS — mark so we never retry
        job.content = '<!-- unavailable -->';
        enrichJob(job.greenhouse_id, { content: job.content });
      }
      await new Promise(function(r){ setTimeout(r, 200); });
    } catch (e) { /* skip */ }
  }
  return fetched;
}

// Score a resume against a set of JDs
// Returns { score, matched, total, topMissing, topMatched, bigramMatched, bigramMissing, jdsAnalyzed }
function scoreResumeVsJDs(resume, jds) {
  if (!resume || !resume.keywords || !resume.keywords.length || !jds || !jds.length) return null;

  var jdsWithContent = jds.filter(function(j){ return j.content; });
  if (jdsWithContent.length < 3) return null;

  var ngrams = extractNgrams(jdsWithContent, 50);
  var topTerms = ngrams.skills.slice(0, 40);
  if (topTerms.length === 0) return null;

  var resumeTerms = new Set(resume.keywords.map(function(k){ return k[0].toLowerCase(); }));
  var resumeText = (resume.extractedText || '').toLowerCase();

  var matched = 0;
  var topMissing = [];
  var topMatched = [];

  for (var i = 0; i < topTerms.length; i++) {
    var term = topTerms[i][0];
    var count = topTerms[i][1];
    var found = resumeTerms.has(term) || resumeText.includes(term);
    if (found) { matched++; topMatched.push({ term: term, count: count }); }
    else { topMissing.push({ term: term, count: count }); }
  }

  // Bigram scoring
  var topBigrams = ngrams.bigrams.slice(0, 25);
  var bigramMatched = [];
  var bigramMissing = [];
  for (var b = 0; b < topBigrams.length; b++) {
    var bi = topBigrams[b][0];
    var bc = topBigrams[b][1];
    var biFound = resumeText.includes(bi);
    if (biFound) { bigramMatched.push({ term: bi, count: bc }); }
    else { bigramMissing.push({ term: bi, count: bc }); }
  }

  var total = topTerms.length;
  var score = total > 0 ? Math.round((matched / total) * 100) : 0;

  return {
    score: score, matched: matched, total: total,
    topMissing: topMissing, topMatched: topMatched,
    bigramMatched: bigramMatched, bigramMissing: bigramMissing,
    jdsAnalyzed: jdsWithContent.length
  };
}

// Score resume against JDs partitioned by level
function scoreResumeByLevel(resume, jds) {
  if (!resume || !resume.keywords || !resume.keywords.length || !jds || !jds.length) return {};
  var hierarchy = levelHierarchy && levelHierarchy.length ? levelHierarchy : [];
  if (hierarchy.length === 0) return {};

  var buckets = {};
  for (var i = 0; i < jds.length; i++) {
    if (!jds[i].content) continue;
    var lvl = getJobLevel(jds[i].title, hierarchy);
    var label = lvl ? lvl.label : 'Unclassified';
    if (!buckets[label]) buckets[label] = [];
    buckets[label].push(jds[i]);
  }

  var results = {};
  var labels = Object.keys(buckets);
  for (var k = 0; k < labels.length; k++) {
    var label = labels[k];
    if (buckets[label].length < 3) continue;
    var s = scoreResumeVsJDs(resume, buckets[label]);
    if (s) { s.jobCount = buckets[label].length; results[label] = s; }
  }
  return results;
}

// Score a single job against the best resume for its filter
function computeJobMatchScore(job) {
  if (!job.content || isContentUnavailable(job.content)) return null;

  var filterNums = job._filterNums || [];
  if (filterNums.length === 0) return null;

  // Find the resume assigned to the first matching filter
  var resume = null;
  var matchedFilterName = null;
  for (var i = 0; i < savedFilters.length; i++) {
    if (filterNums.some(function(fn){ return fn.num == (i + 1); })) {
      // Find a resume that has this filter in its filterIds
      var filterName = savedFilters[i].name;
      for (var ri = 0; ri < resumes.length; ri++) {
        if (!resumes[ri].archived && (resumes[ri].filterIds || []).includes(filterName) && resumes[ri].keywords && resumes[ri].keywords.length > 0) {
          resume = resumes[ri];
          matchedFilterName = filterName;
          break;
        }
      }
      if (resume) break;
    }
  }
  if (!resume || !resume.keywords || !resume.keywords.length) return null;

  var text = stripHtmlToText(job.content);
  var words = tokenize(text);

  // Count term frequency within this job (not arbitrary Set order)
  var termCounts = {};
  for (var w = 0; w < words.length; w++) {
    var word = words[w];
    if (!KW_STOPWORDS.has(word) && !KW_GENERIC.has(word) && word.length > 2) {
      termCounts[word] = (termCounts[word] || 0) + 1;
    }
  }

  // Rank by frequency — top repeated terms are the real requirements
  var jdTerms = Object.entries(termCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 40)
    .map(function(e) { return e[0]; });

  if (jdTerms.length === 0) return null;

  var resumeTerms = new Set(resume.keywords.map(function(k){ return k[0].toLowerCase(); }));
  var resumeText = (resume.extractedText || '').toLowerCase();

  var matched = 0;
  for (var t = 0; t < jdTerms.length; t++) {
    if (resumeTerms.has(jdTerms[t]) || resumeText.includes(jdTerms[t])) matched++;
  }
  var score = jdTerms.length > 0 ? Math.round((matched / jdTerms.length) * 100) : null;
  return score !== null ? { score: score, resumeName: resume.name } : null;
}

// Batch-compute match scores for visible jobs
function computeVisibleJobScores() {
  for (var i = 0; i < currentJobs.length; i++) {
    var job = currentJobs[i];
    if (!job.content || jobMatchScores[job.greenhouse_id] !== undefined) continue;
    var result = computeJobMatchScore(job);
    if (result !== null) {
      jobMatchScores[job.greenhouse_id] = result;
      var cell = document.querySelector('tr[data-jobid="' + job.greenhouse_id + '"] .jt-match');
      if (cell) cell.innerHTML = matchBadge(result);
    }
  }
}

function matchBadge(result) {
  if (!result) return '<span style="color:var(--text-faint);font-size:10px;">\u2014</span>';
  var score = typeof result === 'number' ? result : result.score;
  var rName = typeof result === 'object' ? (result.resumeName || '') : '';
  var g = scoreToGrade(score);
  var tooltip = score + '% match' + (rName ? ' · ' + rName.replace(/"/g, '&quot;') : '');
  return '<span title="' + tooltip + '" style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + g.color + ';cursor:help;">' + g.grade + '</span>';
}

// Main readiness analysis — runs automatically on Resumes page load, or manually via button
// ─── Resume selector for readiness analysis ───
var _resumeSelectOpen = false;
var _selectedResumeIdxs = null; // null = all, Set = specific indexes

function toggleResumeSelector() {
  var dd = document.getElementById('resume-select-dropdown');
  if (!dd) return;
  _resumeSelectOpen = !_resumeSelectOpen;
  dd.style.display = _resumeSelectOpen ? '' : 'none';
  if (_resumeSelectOpen) populateResumeSelector();
}

function populateResumeSelector() {
  var list = document.getElementById('resume-select-list');
  if (!list) return;
  var eligible = [];
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
      eligible.push(i);
    }
  }
  if (eligible.length === 0) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-faint);padding:8px;">No eligible resumes</div>';
    return;
  }
  var html = '';
  eligible.forEach(function(ri) {
    var r = resumes[ri];
    var checked = !_selectedResumeIdxs || _selectedResumeIdxs.has(ri) ? 'checked' : '';
    html += '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;font-size:12px;color:var(--text-dim);">';
    html += '<input type="checkbox" ' + checked + ' onchange="onResumeSelectChange(' + ri + ', this.checked)" style="accent-color:var(--accent);">';
    html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.name || 'Resume ' + (ri + 1)) + '</span>';
    html += '</label>';
  });
  list.innerHTML = html;
}

function onResumeSelectChange(ri, checked) {
  if (!_selectedResumeIdxs) {
    // First deselection — initialize set with all eligible
    _selectedResumeIdxs = new Set();
    for (var i = 0; i < resumes.length; i++) {
      if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
        _selectedResumeIdxs.add(i);
      }
    }
  }
  if (checked) _selectedResumeIdxs.add(ri);
  else _selectedResumeIdxs.delete(ri);
}

function selectAllResumes(all) {
  _selectedResumeIdxs = all ? null : new Set();
  populateResumeSelector();
}

// Close dropdown on outside click
document.addEventListener('click', function(e) {
  if (_resumeSelectOpen && !e.target.closest('#resume-select-wrap')) {
    _resumeSelectOpen = false;
    var dd = document.getElementById('resume-select-dropdown');
    if (dd) dd.style.display = 'none';
  }
});

// ─── AI-powered resume scoring (Pro feature) ───
async function fetchAIScore(params) {
  if (window._aiScoreDisabled) return null;
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return null;

    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    if (!res.ok) {
      console.log('[BJ] AI score HTTP', res.status);
      if (res.status === 406 || res.status === 404) {
        window._aiScoreDisabled = true;
        console.warn('[BJ] AI scoring disabled — Edge Function returned ' + res.status + '. Redeploy with: supabase functions deploy score-resume --no-verify-jwt');
      }
      return null;
    }
    var data = await res.json();
    if (data.error) { console.log('[BJ] AI score error:', data.error); return null; }

    // ─── Premium tier response ───
    if (data.tier === 'premium' || data.tier === 'basic_fallback') {
      return {
        score: data.overall_score || data.match_score,
        matched: null,
        total: null,
        topMissing: (data.gap_analysis || []).map(function(g) { return { term: g.requirement + ' (' + g.severity + ')', count: null }; }),
        topMatched: (data.strength_map || []).map(function(s) { return { term: s.area, count: null }; }),
        bigramMatched: [],
        bigramMissing: [],
        jdsAnalyzed: data.jds_analyzed,
        ai: true,
        premium: data.tier === 'premium',
        partial: data.partial || false,
        fitStatus: data.fit_status,
        summary: data.executive_summary,
        dimensionScores: data.dimension_scores,
        strengthMap: data.strength_map,
        gapAnalysis: data.gap_analysis,
        resumeProfile: data.resume_profile,
        jdProfile: data.jd_profile,
        coaching: data.coaching,
        coreRequirements: data.jd_profile ? (data.jd_profile.core_requirements || []).map(function(cr) {
          var hasEvidence = (data.strength_map || []).some(function(s) { return s.area && s.area.toLowerCase().includes(cr.skill.toLowerCase()); });
          return { skill: cr.skill, prevalence: cr.prevalence_pct, resume_evidence: hasEvidence ? 'strong' : 'missing' };
        }) : [],
        recommendations: data.coaching ? {
          missing_tools: (data.coaching.missing_keyword_injections || []).map(function(k) { return k.keyword; }),
          title_translation: (data.coaching.title_translations || []).map(function(t) { return t.current_title + ' → ' + t.suggested_title; }),
          format: data.coaching.format_improvements || [],
          impact_quantification: (data.coaching.achievement_prompts || []).map(function(a) { return a.weak_bullet; }),
        } : null,
        levelFit: data.level_fit,
        differentialInsight: data.calibration_note,
        careerTrajectory: data.career_trajectory_assessment,
        scopeComparison: typeof data.scope_comparison === 'object' ? data.scope_comparison.delta : data.scope_comparison,
        industryDetected: data.industry_detected,
        agentsUsed: data.agents_used,
        passesCompleted: data.passes_completed,
        timingMs: data.timing_ms,
        upgradePrompt: data.upgrade_prompt
      };
    }

    // ─── Basic tier response (unchanged) ───
    return {
      score: data.match_score,
      matched: null,
      total: null,
      topMissing: (data.recommendations && (data.recommendations.missing_tools || data.recommendations.missing_skills) || data.key_gaps || []).map(function(s) { return { term: s, count: null }; }),
      topMatched: (data.key_matches || []).map(function(s) { return { term: s, count: null }; }),
      bigramMatched: [],
      bigramMissing: [],
      jdsAnalyzed: data.jds_analyzed,
      ai: true,
      premium: false,
      fitStatus: data.fit_status,
      summary: data.analysis_summary,
      coreRequirements: data.core_requirements,
      recommendations: data.recommendations,
      levelFit: data.level_fit,
      differentialInsight: data.differential_insight,
      careerTrajectory: data.career_trajectory_assessment,
      scopeComparison: data.scope_comparison,
      upgradePrompt: data.upgrade_prompt
    };
  } catch (e) {
    console.error('[BJ] AI score error, falling back to ngram:', e);
    return null;
  }
}

async function runReadinessAnalysis(opts) {
  opts = opts || {};
  var silent = opts.silent || false;
  var singleResumeIdx = typeof opts.resumeIndex === 'number' ? opts.resumeIndex : null;
  var btn = singleResumeIdx !== null ? document.getElementById('rc-analyze-' + singleResumeIdx) : document.getElementById('readiness-run-btn');
  var statusEl = document.getElementById('readiness-status');
  var resultsEl = document.getElementById('readiness-results');

  if (readinessRunning) return;
  readinessRunning = true;

  if (!silent && btn) { btn.disabled = true; btn.textContent = singleResumeIdx !== null ? 'Analyzing\u2026' : 'Analyzing All\u2026'; }

  var sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  var hasEligible = false;
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].textStatus === 'ready' && resumes[i].keywords && resumes[i].keywords.length > 0) {
      hasEligible = true; break;
    }
  }

  if (!hasEligible) {
    if (resultsEl) resultsEl.innerHTML = '<div style="font-size:13px;color:var(--text-faint);padding:16px 0;">Upload a resume and wait for keyword extraction to complete before analyzing readiness.</div>';
    if (!silent && btn) { btn.disabled = false; btn.textContent = 'Analyze'; }
    readinessRunning = false;
    return;
  }

  // Show loading state on resume cards
  document.querySelectorAll('.rc-grade-slot').forEach(function(el) {
    el.innerHTML = '<div style="font-size:10px;color:var(--text-faint);font-style:italic;">Analyzing\u2026</div>';
  });

  var scores = {};
  var totalFiltersAnalyzed = 0;
  var totalJDsFetched = 0;

  for (var ri = 0; ri < resumes.length; ri++) {
    var r = resumes[ri];
    if (r.archived || r.textStatus !== 'ready' || !r.keywords || !r.keywords.length) continue;

    // Single-resume mode: only analyze the requested resume
    if (singleResumeIdx !== null && ri !== singleResumeIdx) continue;
    var assignedFilterNames = r.filterIds || [];
    if (assignedFilterNames.length === 0) continue;
    var assignedFilters = sf.filter(function(f){ return assignedFilterNames.includes(f.name); });

    scores[ri] = { filters: {}, levels: {}, overallScore: 0, resumeName: r.name };

    var allJDsForLevel = [];
    var seenIds = new Set();

    for (var fi = 0; fi < assignedFilters.length; fi++) {
      var filter = assignedFilters[fi];
      if (statusEl) statusEl.textContent = 'Fetching JDs for "' + filter.name + '"\u2026';

      var jds = await fetchFilterJDs(filter, 80);

      var withContent = jds.filter(function(j){ return j.content; }).length;
      if (withContent < 30 && jds.length > withContent) {
        if (statusEl) statusEl.textContent = 'Fetching specs for "' + filter.name + '" (' + withContent + '/' + jds.length + ')\u2026';
        var fetched = await batchFetchJDContent(jds, Math.min(30, 50 - withContent));
        totalJDsFetched += fetched;
      }

      var filterScore = null;

      // Try AI scoring for Pro users
      var userPlan = window._bjUserPlan || 'free';
      var jdsWithContentAI = jds.filter(function(j){ return j.content; });
      var analysisTier = opts.tier || 'basic';
      if ((userPlan === 'pro' || userPlan === 'enterprise') && r.extractedText && jdsWithContentAI.length >= 3) {
        if (statusEl) statusEl.textContent = (analysisTier === 'premium' ? 'Deep AI analysis' : 'AI scoring') + ' for "' + filter.name + '"\u2026';
        filterScore = await fetchAIScore({
          resume_text: r.extractedText,
          resume_keywords: r.keywords,
          mode: 'corpus',
          tier: analysisTier,
          filter_name: filter.name,
          job_ids: jdsWithContentAI.map(function(j) { return j.greenhouse_id; }),
          max_jds: 20
        });
      }

      // Fallback to ngram scoring
      if (!filterScore) {
        filterScore = scoreResumeVsJDs(r, jds);
      }
      if (filterScore) {
        scores[ri].filters[filter.name] = filterScore;
        totalFiltersAnalyzed++;

        // Cache the corpus ngrams for this filter (used by feed scoring)
        var jdsWithContent = jds.filter(function(j){ return j.content; });
        if (jdsWithContent.length >= 3) {
          var corpus = extractNgrams(jdsWithContent, 50);
          filterCorpusCache[filter.name] = {
            skills: corpus.skills,
            bigrams: corpus.bigrams,
            jobCount: jdsWithContent.length
          };
        }
      }

      for (var ji = 0; ji < jds.length; ji++) {
        if (!seenIds.has(jds[ji].greenhouse_id)) {
          seenIds.add(jds[ji].greenhouse_id);
          allJDsForLevel.push(jds[ji]);
        }
      }
    }

    scores[ri].levels = scoreResumeByLevel(r, allJDsForLevel);

    var filterScoreValues = Object.keys(scores[ri].filters).map(function(k){ return scores[ri].filters[k].score; });
    scores[ri].overallScore = filterScoreValues.length > 0
      ? Math.round(filterScoreValues.reduce(function(a, b){ return a + b; }, 0) / filterScoreValues.length)
      : 0;
  }

  readinessCache = { lastRun: new Date().toISOString(), scores: scores };
  saveUserData('bj_readiness', JSON.stringify(readinessCache));

  // Update resume cards with grades
  updateResumeCardGrades(scores);

  // Update readiness panel (detailed breakdown)
  renderReadinessResults(scores);

  // Clear feed match cache so scores recompute with new corpus
  jobMatchScores = {};

  if (statusEl) statusEl.textContent = 'Analyzed ' + totalFiltersAnalyzed + ' filter' + (totalFiltersAnalyzed !== 1 ? 's' : '') + ', fetched ' + totalJDsFetched + ' new JDs';
  if (btn) { btn.disabled = false; btn.textContent = singleResumeIdx !== null ? 'Re-analyze' : 'Analyze All'; }
  readinessRunning = false;
}

// Update grade display on each resume card in-place
function updateResumeCardGrades(scores) {
  if (!scores) return;
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var data = scores[ri];
    // Grade display moved entirely to side panel — no inline card grade
  }
  // Update side panels (the primary readiness display)
  updateReadinessSidePanels(scores);
}

// Build the inline grade + insights HTML for a resume card
function buildInlineGrade(ri, data) {
  if (!data) return '';
  var g = scoreToGrade(data.overallScore);
  var filterNames = Object.keys(data.filters);
  var detailId = 'rc-insights-' + ri;

  var html = '<div style="padding:8px 10px;border-radius:8px;background:var(--bg-main);border:1px solid var(--border);margin-bottom:6px;">';

  // Top row: letter grade + score + CTA
  html += '<div style="display:flex;align-items:center;gap:8px;">';
  html += '<span style="font-family:var(--mono);font-size:22px;font-weight:800;color:' + g.color + ';line-height:1;">' + g.grade + '</span>';
  html += '<span style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">' + data.overallScore + '%</span>';

  // Per-filter mini scores
  if (filterNames.length > 0) {
    html += '<div style="display:flex;gap:4px;margin-left:4px;">';
    for (var fi = 0; fi < filterNames.length; fi++) {
      var fname = filterNames[fi];
      var fs = data.filters[fname];
      var fg = scoreToGrade(fs.score);
      html += '<span title="' + fname + ': ' + fs.score + '% (' + fs.matched + '/' + fs.total + ' terms)" style="font-size:9px;padding:1px 5px;border-radius:4px;background:' + fg.color + '15;color:' + fg.color + ';font-weight:600;font-family:var(--mono);cursor:help;">' + fg.grade + '</span>';
    }
    html += '</div>';
  }

  html += '<span onclick="toggleInlineInsights(\'' + detailId + '\',this)" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;white-space:nowrap;">View insights \u25b8</span>';
  html += '</div>';

  // Expandable insights section
  html += '<div id="' + detailId + '" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">';

  // Per-filter breakdown
  for (var fi2 = 0; fi2 < filterNames.length; fi2++) {
    var fname2 = filterNames[fi2];
    var fs2 = data.filters[fname2];
    var fg2 = scoreToGrade(fs2.score);

    html += '<div style="margin-bottom:10px;">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">';
    html += '<span style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + fg2.color + ';">' + fg2.grade + ' ' + fs2.score + '%</span>';
    html += '<span style="font-size:11px;font-weight:600;color:var(--text);">' + fname2 + '</span>';
    html += '<span style="font-size:9px;color:var(--text-faint);">' + fs2.matched + '/' + fs2.total + ' terms \u00b7 ' + fs2.jdsAnalyzed + ' JDs</span>';
    html += '</div>';

    // Missing terms — the actionable insight
    if (fs2.topMissing && fs2.topMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing from your resume:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      for (var mi = 0; mi < fs2.topMissing.length; mi++) {
        var mt = typeof fs2.topMissing[mi] === 'object' ? fs2.topMissing[mi].term : fs2.topMissing[mi];
        var mc = typeof fs2.topMissing[mi] === 'object' ? fs2.topMissing[mi].count : '';
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt;
        if (mc) html += ' <span style="font-family:var(--mono);font-size:8px;opacity:0.7;">' + mc + '</span>';
        html += '</span>';
      }
      html += '</div>';
    }

    // Matched terms
    if (fs2.topMatched && fs2.topMatched.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Covered:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      for (var gi = 0; gi < fs2.topMatched.length; gi++) {
        var gt = typeof fs2.topMatched[gi] === 'object' ? fs2.topMatched[gi].term : fs2.topMatched[gi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">\u2713 ' + gt + '</span>';
      }
      html += '</div>';
    }

    // Missing bigrams
    if (fs2.bigramMissing && fs2.bigramMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing phrases:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      for (var bmi = 0; bmi < Math.min(10, fs2.bigramMissing.length); bmi++) {
        var bmt = typeof fs2.bigramMissing[bmi] === 'object' ? fs2.bigramMissing[bmi].term : fs2.bigramMissing[bmi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + bmt + '</span>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  // Level fit
  var levelLabels = Object.keys(data.levels || {});
  if (levelLabels.length > 0) {
    html += '<div style="padding-top:6px;border-top:1px solid var(--border);">';
    html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">Level Fit</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for (var li = 0; li < levelLabels.length; li++) {
      var lbl = levelLabels[li];
      var ls = data.levels[lbl];
      var lg = scoreToGrade(ls.score);
      html += '<div style="padding:4px 8px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border);text-align:center;">';
      html += '<div style="font-family:var(--mono);font-size:11px;font-weight:700;color:' + lg.color + ';">' + lg.grade + ' ' + ls.score + '%</div>';
      html += '<div style="font-size:9px;color:var(--text-dim);">' + lbl + ' <span style="color:var(--text-faint);">(' + ls.jobCount + ')</span></div>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  html += '</div>'; // close insights
  html += '</div>'; // close outer container

  return html;
}

function toggleInlineInsights(detailId, el) {
  var detail = document.getElementById(detailId);
  if (!detail) return;
  if (detail.style.display === 'none') {
    detail.style.display = '';
    el.textContent = 'Hide insights \u25be';
  } else {
    detail.style.display = 'none';
    el.textContent = 'View insights \u25b8';
  }
}

// Build readiness side panel for a single resume (positioned beside card in row layout)
function buildReadinessSide(ri, data) {
  if (!data) return '';
  var g = scoreToGrade(data.overallScore);
  var filterNames = Object.keys(data.filters);
  var overallLabel = data.overallScore >= 70 ? 'Ready' : data.overallScore >= 40 ? 'Gaps' : 'Weak';

  var html = '<div class="readiness-side" id="readiness-side-' + ri + '">';

  // Header with score and re-analyze button (only if multiple filters to show aggregate)
  if (filterNames.length > 1) {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:26px;font-weight:700;color:' + g.color + ';line-height:1;">' + data.overallScore + '%</div>';
    html += '<div style="font-size:10px;color:' + g.color + ';font-weight:600;">' + overallLabel + '</div>';
    html += '<button class="btn btn-sm btn-secondary" id="rc-analyze-' + ri + '" onclick="runReadinessAnalysis({resumeIndex:' + ri + '})" style="margin-left:auto;font-size:10px;padding:3px 10px;">Re-analyze</button>';
    html += '</div>';
  } else {
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:26px;font-weight:700;color:' + g.color + ';line-height:1;">' + data.overallScore + '%</div>';
    html += '<div style="font-size:10px;color:' + g.color + ';font-weight:600;">' + overallLabel + '</div>';
    html += '<button class="btn btn-sm btn-secondary" id="rc-analyze-' + ri + '" onclick="runReadinessAnalysis({resumeIndex:' + ri + '})" style="margin-left:auto;font-size:10px;padding:3px 10px;">Re-analyze</button>';
    html += '</div>';
  }

  // Per-filter breakdown
  for (var fi = 0; fi < filterNames.length; fi++) {
    var fname = filterNames[fi];
    var fs = data.filters[fname];
    var fc = fs.score >= 70 ? 'var(--green)' : fs.score >= 40 ? 'var(--warm)' : 'var(--red)';
    var detailId = 'rds-detail-' + ri + '-' + fi;

    html += '<div style="margin-bottom:10px;padding-bottom:10px;' + (fi < filterNames.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
    if (filterNames.length > 1) {
      html += '<span style="font-family:var(--mono);font-size:12px;font-weight:600;color:' + fc + ';">' + fs.score + '%</span>';
    }
    html += '<span style="font-size:11px;font-weight:600;color:var(--text);">' + fname + '</span>';
    if (fs.ai) {
      html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(77,142,255,0.15);color:#4d8eff;font-weight:600;">AI</span>';
      html += '<span style="font-size:11px;color:var(--text-faint);">' + (fs.fitStatus || '') + ' \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
    } else {
      html += '<span style="font-size:9px;color:var(--text-faint);">' + fs.matched + '/' + fs.total + ' terms \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
    }
    html += '<span onclick="document.getElementById(\'' + detailId + '\').style.display=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'\':\'none\';this.textContent=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'Show all \u25b8\':\'Hide \u25be\'" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;white-space:nowrap;">Show all \u25b8</span>';
    html += '</div>';

    // ─── AI results rendering ───
    if (fs.ai && fs.summary) {
      html += '<div style="font-size:13px;color:var(--text-dim);margin-bottom:8px;line-height:1.6;">' + fs.summary + '</div>';

      // Premium: dimension score bars
      if (fs.premium && fs.dimensionScores) {
        html += buildDimensionBarsHtml(fs.dimensionScores);
      }

      // Premium: industry detected badge
      if (fs.premium && fs.industryDetected) {
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">';
        html += '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.1);color:#4d8eff;font-weight:600;">PREMIUM</span>';
        html += '<span style="font-size:10px;color:var(--text-faint);">' + fs.industryDetected + ' \u00b7 ' + fs.agentsUsed + ' agents \u00b7 ' + (fs.timingMs / 1000).toFixed(1) + 's</span>';
        html += '</div>';
      }

      // Core requirements (AI)
      if (fs.coreRequirements && fs.coreRequirements.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
        for (var cri = 0; cri < fs.coreRequirements.length; cri++) {
          var cr = fs.coreRequirements[cri];
          var crColor = cr.resume_evidence === 'strong' ? 'var(--green)' : cr.resume_evidence === 'partial' ? 'var(--warm)' : 'var(--red)';
          var crBg = cr.resume_evidence === 'strong' ? 'rgba(34,197,94,0.06)' : cr.resume_evidence === 'partial' ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)';
          var crBorder = cr.resume_evidence === 'strong' ? 'rgba(34,197,94,0.2)' : cr.resume_evidence === 'partial' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.15)';
          var crIcon = cr.resume_evidence === 'strong' ? '\u2713' : cr.resume_evidence === 'partial' ? '\u25cb' : '\u2717';
          html += '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:' + crBg + ';border:1px solid ' + crBorder + ';color:' + crColor + ';">' + crIcon + ' ' + cr.skill + ' <span style="opacity:0.7">' + cr.prevalence + '%</span></span>';
        }
        html += '</div>';
      }

      // Expandable AI detail
      html += '<div id="' + detailId + '" style="display:none;margin-top:6px;">';

      // Recommendations
      if (fs.recommendations) {
        var recSections = [
          { key: 'impact_quantification', label: 'Impact & Metrics', icon: '\u25b9' },
          { key: 'missing_tools', label: 'Missing Tools & Platforms', icon: '\u25b9' },
          { key: 'title_translation', label: 'Title Adjustments', icon: '\u25b9' },
          { key: 'tone_alignment', label: 'Language & Tone', icon: '\u25b9' },
          { key: 'redundancy_fixes', label: 'Cut / Tighten', icon: '\u25b9' },
          { key: 'format', label: 'Format & Structure', icon: '\u25b9' },
          { key: 'missing_skills', label: 'Missing Skills', icon: '\u25b9' },
          { key: 'word_usage', label: 'Word Usage', icon: '\u25b9' },
        ];
        recSections.forEach(function(sec) {
          var items = fs.recommendations[sec.key];
          if (items && items.length > 0) {
            html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:6px 0 4px;">' + sec.icon + ' ' + sec.label + '</div>';
            if (sec.key === 'missing_tools' || sec.key === 'missing_skills') {
              html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
              items.forEach(function(s) {
                html += '<span style="font-size:11px;padding:2px 7px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + s + '</span>';
              });
              html += '</div>';
            } else {
              items.forEach(function(tip) {
                html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;margin-bottom:3px;line-height:1.5;">\u2192 ' + tip + '</div>';
              });
            }
          }
        });

        // Gap narrative (single string, not array)
        if (fs.recommendations.gap_narrative) {
          html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:6px 0 4px;">\u25b9 Career Gap Narrative</div>';
          html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;margin-bottom:3px;line-height:1.5;">' + fs.recommendations.gap_narrative + '</div>';
        }
      }

      // Career trajectory assessment
      if (fs.careerTrajectory) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Career Trajectory</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;line-height:1.5;">' + fs.careerTrajectory + '</div>';
      }

      // Scope comparison
      if (fs.scopeComparison) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Scope Match</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding-left:10px;line-height:1.5;">' + fs.scopeComparison + '</div>';
      }

      // Level fit (AI)
      if (fs.levelFit) {
        html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin:8px 0 4px;">\u25b9 Level Fit</div>';
        html += '<div style="font-size:12px;color:var(--text-dim);padding:6px 10px;background:var(--bg-card);border-radius:6px;border:1px solid var(--border);line-height:1.5;">';
        html += '<strong>' + fs.levelFit.best_level + '</strong> \u2014 ' + fs.levelFit.reasoning;
        html += '</div>';
      }

      // Differential insight
      if (fs.differentialInsight) {
        html += '<div style="font-size:12px;color:var(--accent);margin-top:8px;font-style:italic;line-height:1.5;">' + fs.differentialInsight + '</div>';
      }

      // Premium: coaching section
      if (fs.premium && fs.coaching) {
        html += buildPremiumCoachingHtml(fs);

        // Gap interview container (populated async after render)
        html += '<div id="gap-interview-container-' + ri + '-' + fi + '"></div>';

        // Acceptance UI (hidden until gap interview completes or is skipped)
        html += buildAcceptanceHtml(ri, fi, fs);
      }

      html += '</div>'; // close expandable
    } else {
      // ─── Ngram results rendering (fallback) ───

    // Missing terms preview
    if (fs.topMissing && fs.topMissing.length > 0) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px;">';
      var previewCount = Math.min(5, fs.topMissing.length);
      for (var mi = 0; mi < previewCount; mi++) {
        var mt = typeof fs.topMissing[mi] === 'object' ? fs.topMissing[mi].term : fs.topMissing[mi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt + '</span>';
      }
      if (fs.topMissing.length > 5) html += '<span style="font-size:9px;color:var(--text-faint);">+' + (fs.topMissing.length - 5) + ' more</span>';
      html += '</div>';
    }

    // Expandable: matched + missing bigrams
    html += '<div id="' + detailId + '" style="display:none;margin-top:6px;">';
    if (fs.topMatched && fs.topMatched.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Covered:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px;">';
      for (var gi = 0; gi < fs.topMatched.length; gi++) {
        var gt = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].term : fs.topMatched[gi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">\u2713 ' + gt + '</span>';
      }
      html += '</div>';
    }
    if (fs.bigramMissing && fs.bigramMissing.length > 0) {
      html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:3px;">Missing phrases:</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:3px;">';
      for (var bmi = 0; bmi < Math.min(10, fs.bigramMissing.length); bmi++) {
        var bmt = typeof fs.bigramMissing[bmi] === 'object' ? fs.bigramMissing[bmi].term : fs.bigramMissing[bmi];
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + bmt + '</span>';
      }
      html += '</div>';
    }
    html += '</div>'; // close expandable

    } // end ngram branch

    html += '</div>'; // close filter block
  }

  // Level fit
  var levelLabels = Object.keys(data.levels || {});
  if (levelLabels.length > 0) {
    html += '<div style="padding-top:6px;border-top:1px solid var(--border);">';
    html += '<div style="font-size:9px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">Level Fit</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for (var li = 0; li < levelLabels.length; li++) {
      var lbl = levelLabels[li];
      var ls = data.levels[lbl];
      var lc = ls.score >= 70 ? 'var(--green)' : ls.score >= 40 ? 'var(--warm)' : 'var(--red)';
      html += '<div style="text-align:center;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-main);min-width:60px;">';
      html += '<div style="font-family:var(--mono);font-size:12px;font-weight:700;color:' + lc + ';">' + ls.score + '%</div>';
      html += '<div style="font-size:10px;color:var(--text-dim);">' + lbl + '</div>';
      html += '<div style="font-size:9px;color:var(--text-faint);">' + ls.jobCount + ' jobs</div>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

// ─── Premium coaching panel (rendered inside readiness side when premium data exists) ───
function buildPremiumCoachingHtml(fs) {
  if (!fs.coaching) return '';
  var c = fs.coaching;
  var html = '';

  // Priority actions — the headline feature
  if (c.priority_actions && c.priority_actions.length > 0) {
    html += '<div style="margin-top:10px;padding:10px;background:rgba(77,142,255,0.04);border:1px solid rgba(77,142,255,0.15);border-radius:8px;">';
    html += '<div style="font-size:11px;font-weight:700;color:#4d8eff;margin-bottom:8px;">\u2728 Top 3 Changes</div>';
    c.priority_actions.forEach(function(pa, idx) {
      html += '<div style="margin-bottom:8px;padding-bottom:8px;' + (idx < c.priority_actions.length - 1 ? 'border-bottom:1px solid rgba(77,142,255,0.1);' : '') + '">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.5;">' + (idx + 1) + '. ' + pa.action + '</div>';
      html += '<div style="font-size:11px;color:var(--text-faint);margin-top:2px;">' + pa.why + '</div>';
      if (pa.expected_impact) html += '<div style="font-size:10px;color:var(--green);font-weight:600;margin-top:2px;">' + pa.expected_impact + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Rewrite suggestions — before/after
  if (c.rewrite_suggestions && c.rewrite_suggestions.length > 0) {
    html += '<div style="margin-top:8px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">\u270f\ufe0f Rewrite Suggestions</div>';
    c.rewrite_suggestions.forEach(function(rw) {
      html += '<div style="margin-bottom:8px;padding:8px;background:var(--bg-main);border-radius:6px;border:1px solid var(--border);">';
      if (rw.original_text) html += '<div style="font-size:11px;color:var(--red);text-decoration:line-through;margin-bottom:4px;line-height:1.5;">' + rw.original_text + '</div>';
      html += '<div style="font-size:11px;color:var(--green);line-height:1.5;">' + rw.suggested_text + '</div>';
      if (rw.rationale) html += '<div style="font-size:10px;color:var(--text-faint);margin-top:4px;font-style:italic;">' + rw.rationale + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Gap bridging
  if (c.gap_bridging && c.gap_bridging.length > 0) {
    html += '<div style="margin-top:8px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-faint);margin-bottom:4px;">\u2194 Bridge Gaps</div>';
    c.gap_bridging.forEach(function(gb) {
      html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;line-height:1.5;"><strong style="color:var(--warm);">' + gb.gap + ':</strong> ' + gb.bridge_strategy + '</div>';
    });
    html += '</div>';
  }

  // Competitive positioning
  if (c.competitive_positioning) {
    html += '<div style="margin-top:8px;padding:8px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.15);border-radius:6px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:4px;">\u2191 Positioning</div>';
    html += '<div style="font-size:12px;color:var(--text-dim);line-height:1.5;">' + c.competitive_positioning + '</div>';
    html += '</div>';
  }

  return html;
}

// ─── Premium dimension scores radar (simple bar visualization) ───
function buildDimensionBarsHtml(ds) {
  if (!ds) return '';
  var dims = [
    { key: 'trajectory', label: 'Trajectory', weight: '25%' },
    { key: 'impact', label: 'Impact', weight: '25%' },
    { key: 'skills', label: 'Skills', weight: '20%' },
    { key: 'alignment', label: 'Alignment', weight: '15%' },
    { key: 'education', label: 'Education', weight: '5%' },
    { key: 'presentation', label: 'Presentation', weight: '10%' }
  ];
  var html = '<div style="margin:8px 0;">';
  dims.forEach(function(d) {
    var val = ds[d.key] || 0;
    var color = val >= 70 ? 'var(--green)' : val >= 40 ? 'var(--warm)' : 'var(--red)';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">';
    html += '<span style="font-size:10px;color:var(--text-faint);width:75px;text-align:right;">' + d.label + '</span>';
    html += '<div style="flex:1;height:6px;background:var(--bg-main);border-radius:3px;overflow:hidden;">';
    html += '<div style="width:' + val + '%;height:100%;background:' + color + ';border-radius:3px;"></div>';
    html += '</div>';
    html += '<span style="font-size:10px;font-family:var(--mono);color:' + color + ';width:28px;font-weight:600;">' + val + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ════════════════════════════════════════════════════════════
// GAP INTERVIEW + ACCEPTANCE UI (G7–G12)
// ════════════════════════════════════════════════════════════

// State for the rewrite pipeline — stored per resume index
window._bjRewriteState = {};

// G7: Fetch gap interview questions from Edge Function
async function fetchGapInterview(gapAnalysis, resumeProfile) {
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return null;

    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode: 'gap-interview',
        gap_analysis: gapAnalysis,
        resume_profile: resumeProfile
      })
    });

    if (!res.ok) { console.log('[BJ] Gap interview HTTP', res.status); return null; }
    var data = await res.json();
    if (data.error) { console.log('[BJ] Gap interview error:', data.error); return null; }
    return data.gap_questions || [];
  } catch (e) {
    console.error('[BJ] Gap interview error:', e);
    return null;
  }
}

// G8: Build the Gap Interview UI
function buildGapInterviewHtml(ri, fi, gapQuestions) {
  if (!gapQuestions || gapQuestions.length === 0) return '';
  var stateKey = ri + '-' + fi;

  var html = '<div class="bj-gap-interview" id="gap-interview-' + stateKey + '" style="margin-top:12px;padding:12px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--warm);margin-bottom:8px;">\ud83d\udd0d Close Your Gaps</div>';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">We found gaps between your resume and target roles. Answer these questions to uncover experience you may have missed.</div>';

  gapQuestions.forEach(function(gq, gi) {
    var sevColor = gq.severity === 'critical' ? 'var(--red)' : gq.severity === 'important' ? 'var(--warm)' : 'var(--text-faint)';
    var sevBg = gq.severity === 'critical' ? 'rgba(239,68,68,0.08)' : gq.severity === 'important' ? 'rgba(245,158,11,0.08)' : 'rgba(128,128,128,0.05)';

    html += '<div style="margin-bottom:10px;padding:8px;background:' + sevBg + ';border-radius:6px;border:1px solid var(--border);">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
    html += '<span style="font-size:10px;padding:1px 5px;border-radius:3px;background:' + sevBg + ';color:' + sevColor + ';font-weight:600;border:1px solid ' + sevColor + ';">' + gq.severity + '</span>';
    html += '<span style="font-size:12px;font-weight:600;color:var(--text);">' + gq.gap + '</span>';
    html += '</div>';

    if (gq.hint) {
      html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:6px;font-style:italic;">' + gq.hint + '</div>';
    }

    (gq.questions || []).forEach(function(q, qi) {
      var inputId = 'gap-answer-' + stateKey + '-' + gi + '-' + qi;
      html += '<div style="margin-bottom:4px;">';
      html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:2px;">' + q + '</div>';
      html += '<input type="text" id="' + inputId + '" placeholder="Your answer (optional)" style="width:100%;padding:4px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;" onchange="bjUpdateGapAnswer(\'' + stateKey + '\',' + gi + ',' + qi + ',this.value)">';
      html += '</div>';
    });

    html += '</div>';
  });

  html += '<div style="display:flex;gap:8px;margin-top:8px;">';
  html += '<button class="btn btn-sm" onclick="bjSkipGapInterview(\'' + stateKey + '\')" style="font-size:10px;padding:3px 10px;color:var(--text-faint);">Skip</button>';
  html += '<button class="btn btn-sm" onclick="bjCompleteGapInterview(\'' + stateKey + '\')" style="font-size:10px;padding:3px 12px;background:var(--warm);color:#fff;font-weight:600;">Continue \u2192</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

// Gap answer tracking
function bjUpdateGapAnswer(stateKey, gapIdx, questionIdx, value) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  if (!window._bjRewriteState[stateKey].gapAnswers) window._bjRewriteState[stateKey].gapAnswers = {};
  var key = gapIdx + '-' + questionIdx;
  window._bjRewriteState[stateKey].gapAnswers[key] = value;
}

function bjSkipGapInterview(stateKey) {
  var el = document.getElementById('gap-interview-' + stateKey);
  if (el) el.style.display = 'none';
  bjShowAcceptanceUI(stateKey);
}

function bjCompleteGapInterview(stateKey) {
  var el = document.getElementById('gap-interview-' + stateKey);
  if (el) el.style.display = 'none';
  bjShowAcceptanceUI(stateKey);
}

// G9-G12: Build the Acceptance UI
function bjShowAcceptanceUI(stateKey) {
  var el = document.getElementById('acceptance-ui-' + stateKey);
  if (el) el.style.display = '';
}

function buildAcceptanceHtml(ri, fi, filterScore) {
  if (!filterScore || !filterScore.premium) return '';
  var stateKey = ri + '-' + fi;

  // Initialize state
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  var state = window._bjRewriteState[stateKey];
  state.accepted = state.accepted || {};
  state.achievementInputs = state.achievementInputs || {};
  state.userHighlights = state.userHighlights || [];
  state.userNotes = state.userNotes || '';
  state.coverLetter = state.coverLetter || false;
  state.template = state.template || 'executive';

  var coaching = filterScore.coaching || {};
  var allRecs = [];
  var recIdx = 0;

  // Collect all recommendations into a flat list with IDs
  function addRecs(items, type, labelFn) {
    if (!items || !items.length) return;
    items.forEach(function(item, i) {
      var id = type + '-' + i;
      allRecs.push({ id: id, type: type, data: item, label: labelFn(item) });
      if (state.accepted[id] === undefined) state.accepted[id] = true; // default to accepted
    });
  }

  addRecs(coaching.priority_actions, 'priority', function(p) {
    return { title: p.action, subtitle: p.why, badge: p.expected_impact };
  });
  addRecs(coaching.rewrite_suggestions, 'rewrite', function(r) {
    return { title: r.suggested_text, subtitle: r.original_text ? 'Currently: ' + r.original_text : '', badge: r.rationale };
  });
  addRecs(coaching.missing_keyword_injections, 'keyword', function(k) {
    return { title: 'Add "' + k.keyword + '"', subtitle: k.where_to_add + ' \u2014 ' + k.how_to_phrase, badge: null };
  });
  addRecs(coaching.title_translations, 'title', function(t) {
    return { title: t.current_title + ' \u2192 ' + t.suggested_title, subtitle: t.reasoning, badge: null };
  });
  addRecs(coaching.achievement_prompts, 'achievement', function(a) {
    return { title: 'Quantify: "' + a.weak_bullet + '"', subtitle: null, questions: a.questions_to_quantify, badge: null };
  });
  addRecs(coaching.format_improvements, 'format', function(f) {
    return { title: typeof f === 'string' ? f : f.description || JSON.stringify(f), subtitle: null, badge: null };
  });
  addRecs(coaching.gap_bridging, 'gap', function(g) {
    return { title: g.gap, subtitle: g.bridge_strategy, badge: null };
  });

  if (allRecs.length === 0) return '';

  var acceptedCount = Object.keys(state.accepted).filter(function(k) { return state.accepted[k]; }).length;

  var html = '<div class="bj-acceptance-ui" id="acceptance-ui-' + stateKey + '" style="display:none;margin-top:12px;padding:12px;background:rgba(77,142,255,0.03);border:1px solid rgba(77,142,255,0.12);border-radius:8px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;font-weight:700;color:#4d8eff;">\u2728 Rewrite Your Resume</div>';
  html += '<span style="font-size:10px;color:var(--text-faint);margin-left:auto;" id="accept-count-' + stateKey + '">' + acceptedCount + '/' + allRecs.length + ' accepted</span>';
  html += '</div>';

  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px;">Accept the recommendations you want applied. Reject any you disagree with.</div>';

  // Select All / Deselect All
  html += '<div style="display:flex;gap:8px;margin-bottom:10px;">';
  html += '<button class="btn btn-sm" onclick="bjToggleAll(\'' + stateKey + '\',true)" style="font-size:9px;padding:2px 8px;">Select All</button>';
  html += '<button class="btn btn-sm" onclick="bjToggleAll(\'' + stateKey + '\',false)" style="font-size:9px;padding:2px 8px;">Deselect All</button>';
  html += '</div>';

  // Recommendation cards
  allRecs.forEach(function(rec) {
    var isAccepted = state.accepted[rec.id] !== false;
    var borderColor = isAccepted ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
    var bgColor = isAccepted ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
    var typeColors = { priority: '#4d8eff', rewrite: 'var(--green)', keyword: 'var(--warm)', title: '#7c3aed', achievement: '#f59e0b', format: 'var(--text-faint)', gap: 'var(--warm)' };
    var typeLabel = rec.type.charAt(0).toUpperCase() + rec.type.slice(1);

    html += '<div id="rec-card-' + stateKey + '-' + rec.id + '" style="margin-bottom:6px;padding:8px 10px;border-radius:6px;border:1px solid ' + borderColor + ';background:' + bgColor + ';transition:all 0.15s;">';
    html += '<div style="display:flex;align-items:flex-start;gap:8px;">';

    // Checkbox
    html += '<input type="checkbox" ' + (isAccepted ? 'checked' : '') + ' onchange="bjToggleRec(\'' + stateKey + '\',\'' + rec.id + '\',this.checked)" style="margin-top:2px;accent-color:var(--green);cursor:pointer;">';

    // Content
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px;">';
    html += '<span style="font-size:9px;padding:1px 4px;border-radius:2px;background:' + (typeColors[rec.type] || 'var(--text-faint)') + ';color:#fff;font-weight:600;">' + typeLabel + '</span>';
    if (rec.label.badge) html += '<span style="font-size:9px;color:var(--green);font-weight:600;">' + rec.label.badge + '</span>';
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--text);line-height:1.5;">' + rec.label.title + '</div>';
    if (rec.label.subtitle) html += '<div style="font-size:10px;color:var(--text-faint);line-height:1.4;margin-top:1px;">' + rec.label.subtitle + '</div>';

    // Achievement prompt inputs (G10)
    if (rec.type === 'achievement' && rec.label.questions && isAccepted) {
      html += '<div style="margin-top:6px;padding:6px;background:rgba(245,158,11,0.05);border-radius:4px;">';
      rec.label.questions.forEach(function(q, qi) {
        var inputId = 'ach-input-' + stateKey + '-' + rec.id + '-' + qi;
        var savedVal = (state.achievementInputs[rec.id] || {})[qi] || '';
        html += '<div style="margin-bottom:3px;">';
        html += '<div style="font-size:10px;color:var(--text-dim);">' + q + '</div>';
        html += '<input type="text" id="' + inputId + '" value="' + savedVal.replace(/"/g, '&quot;') + '" placeholder="Your answer" style="width:100%;padding:3px 6px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:3px;color:var(--text);outline:none;" onchange="bjUpdateAchievement(\'' + stateKey + '\',\'' + rec.id + '\',' + qi + ',this.value)">';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>'; // content
    html += '</div>'; // flex row
    html += '</div>'; // card
  });

  // G11: User highlights & notes
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">\ud83d\udcdd Your Additions</div>';
  html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:6px;">Anything else you want changed, emphasized, or excluded?</div>';
  html += '<textarea id="user-notes-' + stateKey + '" placeholder="E.g.: Emphasize my patent from 2024. Don\'t include freelance work from 2019. My title is officially Sr. Engineer but I\'ve been functioning as tech lead." style="width:100%;height:50px;padding:6px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;resize:vertical;font-family:inherit;" onchange="bjUpdateNotes(\'' + stateKey + '\',this.value)">' + (state.userNotes || '') + '</textarea>';

  // Highlight chips
  html += '<div style="margin-top:6px;">';
  html += '<div style="font-size:10px;color:var(--text-faint);margin-bottom:3px;">Specific highlights to include:</div>';
  html += '<div id="highlights-list-' + stateKey + '" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">';
  (state.userHighlights || []).forEach(function(h, hi) {
    html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:4px;">';
  html += '<input type="text" id="highlight-input-' + stateKey + '" placeholder="Add a highlight" style="flex:1;padding:3px 6px;font-size:10px;background:var(--bg-main);border:1px solid var(--border);border-radius:3px;color:var(--text);outline:none;" onkeydown="if(event.key===\'Enter\')bjAddHighlight(\'' + stateKey + '\')">';
  html += '<button class="btn btn-sm" onclick="bjAddHighlight(\'' + stateKey + '\')" style="font-size:9px;padding:2px 8px;">+</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // G12: Cover letter opt-in
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px;">';
  html += '<input type="checkbox" id="cover-letter-' + stateKey + '" ' + (state.coverLetter ? 'checked' : '') + ' onchange="bjToggleCoverLetter(\'' + stateKey + '\',this.checked)" style="accent-color:#4d8eff;cursor:pointer;">';
  html += '<label for="cover-letter-' + stateKey + '" style="font-size:11px;color:var(--text);cursor:pointer;">Include a tailored cover letter</label>';
  html += '</div>';

  // Template selection
  html += '<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);">';
  html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">Resume Template</div>';
  html += '<div style="display:flex;gap:6px;">';
  var templates = [
    { id: 'executive', name: 'Executive', desc: 'Clean, minimal', best: 'Senior roles' },
    { id: 'modern', name: 'Modern', desc: 'Two-column sidebar', best: 'Tech, creative' },
    { id: 'classic', name: 'Classic', desc: 'Traditional', best: 'Finance, legal' }
  ];
  templates.forEach(function(t) {
    var sel = (state.template || 'executive') === t.id;
    var border = sel ? '2px solid #4d8eff' : '1px solid var(--border)';
    var bg = sel ? 'rgba(77,142,255,0.05)' : 'var(--bg-main)';
    html += '<div onclick="bjSelectTemplate(\'' + stateKey + '\',\'' + t.id + '\')" style="flex:1;padding:8px;border-radius:6px;border:' + border + ';background:' + bg + ';cursor:pointer;text-align:center;">';
    html += '<div style="font-size:11px;font-weight:600;color:' + (sel ? '#4d8eff' : 'var(--text)') + ';">' + t.name + '</div>';
    html += '<div style="font-size:9px;color:var(--text-faint);">' + t.desc + '</div>';
    html += '<div style="font-size:8px;color:var(--text-faint);margin-top:2px;">Best for: ' + t.best + '</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Generate Rewrite button
  html += '<div style="margin-top:12px;text-align:center;">';
  html += '<button class="btn" id="gen-rewrite-' + stateKey + '" onclick="bjGenerateRewrite(\'' + stateKey + '\',' + ri + ',' + fi + ')" style="background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:700;padding:8px 24px;font-size:12px;border-radius:6px;width:100%;">';
  html += '\u2728 Generate Rewrite</button>';
  html += '<div style="font-size:9px;color:var(--text-faint);margin-top:4px;">This will use premium credits</div>';
  html += '</div>';

  html += '</div>'; // close acceptance-ui
  return html;
}

// ─── Acceptance UI interaction handlers ───

function bjToggleRec(stateKey, recId, checked) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  if (!window._bjRewriteState[stateKey].accepted) window._bjRewriteState[stateKey].accepted = {};
  window._bjRewriteState[stateKey].accepted[recId] = checked;

  // Update card visual
  var card = document.getElementById('rec-card-' + stateKey + '-' + recId);
  if (card) {
    card.style.borderColor = checked ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
    card.style.background = checked ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
  }

  // Update count
  bjUpdateAcceptCount(stateKey);
}

function bjToggleAll(stateKey, accept) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.accepted) return;
  Object.keys(state.accepted).forEach(function(k) {
    state.accepted[k] = accept;
    var card = document.getElementById('rec-card-' + stateKey + '-' + k);
    if (card) {
      card.style.borderColor = accept ? 'rgba(34,197,94,0.3)' : 'rgba(128,128,128,0.15)';
      card.style.background = accept ? 'rgba(34,197,94,0.03)' : 'var(--bg-main)';
      var cb = card.querySelector('input[type=checkbox]');
      if (cb) cb.checked = accept;
    }
  });
  bjUpdateAcceptCount(stateKey);
}

function bjUpdateAcceptCount(stateKey) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.accepted) return;
  var total = Object.keys(state.accepted).length;
  var accepted = Object.keys(state.accepted).filter(function(k) { return state.accepted[k]; }).length;
  var el = document.getElementById('accept-count-' + stateKey);
  if (el) el.textContent = accepted + '/' + total + ' accepted';
}

function bjUpdateAchievement(stateKey, recId, qi, value) {
  var state = window._bjRewriteState[stateKey];
  if (!state) return;
  if (!state.achievementInputs) state.achievementInputs = {};
  if (!state.achievementInputs[recId]) state.achievementInputs[recId] = {};
  state.achievementInputs[recId][qi] = value;
}

function bjUpdateNotes(stateKey, value) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].userNotes = value;
}

function bjAddHighlight(stateKey) {
  var input = document.getElementById('highlight-input-' + stateKey);
  if (!input || !input.value.trim()) return;
  var state = window._bjRewriteState[stateKey];
  if (!state) return;
  if (!state.userHighlights) state.userHighlights = [];
  state.userHighlights.push(input.value.trim());
  input.value = '';
  // Re-render highlights list
  var list = document.getElementById('highlights-list-' + stateKey);
  if (list) {
    var html = '';
    state.userHighlights.forEach(function(h, hi) {
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
    });
    list.innerHTML = html;
  }
}

function bjRemoveHighlight(stateKey, idx) {
  var state = window._bjRewriteState[stateKey];
  if (!state || !state.userHighlights) return;
  state.userHighlights.splice(idx, 1);
  bjAddHighlight(stateKey); // Trick: re-render by calling with empty (input already cleared)
  // Actually just re-render the list
  var list = document.getElementById('highlights-list-' + stateKey);
  if (list) {
    var html = '';
    state.userHighlights.forEach(function(h, hi) {
      html += '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:rgba(77,142,255,0.08);border:1px solid rgba(77,142,255,0.2);color:#4d8eff;">' + h + ' <span onclick="bjRemoveHighlight(\'' + stateKey + '\',' + hi + ')" style="cursor:pointer;opacity:0.6;">\u2717</span></span>';
    });
    list.innerHTML = html;
  }
}

function bjToggleCoverLetter(stateKey, checked) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].coverLetter = checked;
}

function bjSelectTemplate(stateKey, templateId) {
  if (!window._bjRewriteState[stateKey]) window._bjRewriteState[stateKey] = {};
  window._bjRewriteState[stateKey].template = templateId;
  // Re-render template cards to show selection
  var parent = document.getElementById('acceptance-ui-' + stateKey);
  if (!parent) return;
  var cards = parent.querySelectorAll('[onclick^="bjSelectTemplate"]');
  cards.forEach(function(card) {
    var isThis = card.getAttribute('onclick').includes("'" + templateId + "'");
    card.style.border = isThis ? '2px solid #4d8eff' : '1px solid var(--border)';
    card.style.background = isThis ? 'rgba(77,142,255,0.05)' : 'var(--bg-main)';
    var nameEl = card.querySelector('div');
    if (nameEl) nameEl.style.color = isThis ? '#4d8eff' : 'var(--text)';
  });
}

// G-S3: Call rewrite-resume Edge Function and handle download
async function bjGenerateRewrite(stateKey, ri, fi) {
  var state = window._bjRewriteState[stateKey];
  if (!state) return;

  var btn = document.getElementById('gen-rewrite-' + stateKey);
  if (btn) { btn.disabled = true; btn.textContent = 'Writing resume\u2026'; btn.style.opacity = '0.6'; }

  // Get the filter score data
  var filterNames = Object.keys(scores[ri]?.filters || {});
  var filterScore = scores[ri]?.filters[filterNames[fi]];
  if (!filterScore || !filterScore.premium) {
    if (btn) { btn.textContent = 'Error: No premium analysis found'; btn.style.background = 'var(--red)'; }
    return;
  }

  // Collect accepted recommendations with their full data
  var acceptedRecs = [];
  Object.keys(state.accepted || {}).forEach(function(k) {
    if (!state.accepted[k]) return;
    acceptedRecs.push({
      id: k,
      type: k.split('-')[0],
      user_input: (state.achievementInputs || {})[k] || null
    });
  });

  // Get resume data
  var r = resumes[ri];
  if (!r) { if (btn) { btn.textContent = 'Error: Resume not found'; } return; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { if (btn) { btn.textContent = 'Not logged in'; } return; }

    if (btn) btn.textContent = 'Writing resume\u2026';

    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resume_text: r.extractedText || '',
        resume_profile: filterScore.resumeProfile,
        jd_profile: filterScore.jdProfile,
        accepted_recommendations: acceptedRecs,
        achievement_inputs: state.achievementInputs || {},
        gap_answers: state.gapAnswers || {},
        user_highlights: state.userHighlights || [],
        user_notes: state.userNotes || '',
        include_cover_letter: state.coverLetter || false,
        template_id: state.template || 'executive',
        filter_name: filterNames[fi] || 'General',
        coaching: filterScore.coaching
      })
    });

    if (!res.ok) {
      var errData = await res.json().catch(function() { return { error: 'Unknown error' }; });
      console.error('[BJ] Rewrite error:', errData);
      if (btn) { btn.textContent = 'Rewrite failed — try again'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background = 'var(--red)'; }
      return;
    }

    var data = await res.json();
    console.log('[BJ] Rewrite complete:', data.session_id, data.timing);

    // Store the rewrite result
    state.rewriteResult = data;

    // Show results panel
    bjShowRewriteResults(stateKey, ri, fi, data);

  } catch (e) {
    console.error('[BJ] Rewrite exception:', e);
    if (btn) { btn.textContent = 'Error — try again'; btn.disabled = false; btn.style.opacity = '1'; btn.style.background = 'var(--red)'; }
  }
}

// Show rewrite results with download links
function bjShowRewriteResults(stateKey, ri, fi, data) {
  var btn = document.getElementById('gen-rewrite-' + stateKey);
  var container = document.getElementById('acceptance-ui-' + stateKey);
  if (!container) return;

  // G23: Auto-add rewritten resume to library
  var filterNames = Object.keys(scores[ri]?.filters || {});
  var fname = filterNames[fi] || 'General';
  var originalResume = resumes[ri];
  if (originalResume && data.resume_sections) {
    var roundNum = data.round_number || 1;
    var newName = (originalResume.name || 'Resume') + ' \u2014 ' + fname + ' v' + roundNum;
    var extractedText = '';
    (data.resume_sections || []).forEach(function(sec) {
      (sec.items || []).forEach(function(item) {
        if (item.content) {
          if (item.content.text) extractedText += item.content.text + ' ';
          if (item.content.bullets) extractedText += item.content.bullets.join(' ') + ' ';
          if (item.content.skills) extractedText += item.content.skills.join(' ') + ' ';
        }
      });
    });
    resumes.push({
      name: newName, source: 'rewrite', rewrite_session_id: data.session_id,
      rewrite_round: roundNum, filterIds: [fname], levelLabel: originalResume.levelLabel || '',
      extractedText: extractedText.trim(), textStatus: 'ready', tier: 'premium',
      tier_history: [
        { action: 'analyzed', tier: 'premium', timestamp: new Date().toISOString() },
        { action: 'rewritten', tier: 'premium', round: roundNum, timestamp: new Date().toISOString() }
      ],
      storagePath: data.resume_path, size: 0, lastModified: Date.now(), archived: false
    });
    if (typeof saveResumes === 'function') saveResumes();
    console.log('[BJ] Auto-saved rewritten resume:', newName);
  }

  // G24: Save cover letter to database
  if (data.cover_letter && data.cover_letter_path) {
    bjSaveCoverLetter(data, fname);
  }

  var html = '<div style="margin-top:12px;padding:12px;background:rgba(34,197,94,0.04);border:1px solid rgba(34,197,94,0.15);border-radius:8px;">';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<div style="font-size:13px;font-weight:700;color:var(--green);">\u2705 Rewrite Complete</div>';
  html += '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:600;">\u2728 Premium</span>';
  html += '</div>';

  if (data.resume_path) {
    var resumeUrl = SUPABASE_URL + '/storage/v1/object/public/' + data.resume_path;
    html += '<a href="' + resumeUrl + '" download="resume.docx" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#4d8eff;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin-bottom:6px;margin-right:8px;">\ud83d\udcc4 Download Resume</a>';
  }
  if (data.cover_letter_path) {
    var coverUrl = SUPABASE_URL + '/storage/v1/object/public/' + data.cover_letter_path;
    html += '<a href="' + coverUrl + '" download="cover-letter.docx" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#7c3aed;color:#fff;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin-bottom:6px;">\ud83d\udcc4 Cover Letter</a>';
  }

  html += '<div style="font-size:10px;color:var(--green);margin:6px 0;">\u2713 Resume auto-saved to library and assigned to "' + fname + '"</div>';
  html += '<div style="margin-top:6px;font-size:11px;color:var(--text-dim);"><strong>Template:</strong> ' + (data.template_used || 'executive') + ' \u00b7 <strong>Changes:</strong> ' + (data.changes_made || []).length + ' \u00b7 <strong>Time:</strong> ' + ((data.timing?.total_ms || 0) / 1000).toFixed(1) + 's (' + (data.agents_used || 1) + ' agents)</div>';

  if (data.qa_report) {
    html += '<div style="margin-top:10px;padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:6px;">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">\ud83d\udd0d QA Review</div>';
    var acc = data.qa_report.accuracy;
    if (acc) {
      html += '<div style="font-size:11px;color:' + (acc.clean ? 'var(--green)' : 'var(--warm)') + ';">' + (acc.clean ? '\u2713' : '\u26a0') + ' Accuracy: ' + (acc.clean ? 'Clean' : acc.flag_count + ' issue(s)') + '</div>';
      if (!acc.clean && acc.flags) acc.flags.forEach(function(f) { html += '<div style="font-size:10px;color:' + (f.severity==='critical'?'var(--red)':'var(--warm)') + ';padding-left:14px;">\u2022 ' + f.issue + '</div>'; });
    }
    var bl = data.qa_report.bleed;
    if (bl) html += '<div style="font-size:11px;color:' + (bl.clean?'var(--green)':'var(--warm)') + ';">' + (bl.clean?'\u2713':'\u26a0') + ' Consistency: ' + (bl.clean?'Clean':bl.flag_count+' issue(s)') + '</div>';
    var vo = data.qa_report.voice;
    if (vo) html += '<div style="font-size:11px;color:var(--green);">\u2713 Polish: ' + (vo.auto_fixes_applied||0) + ' AI-speak fixes</div>';
    var li = data.qa_report.linkedin || data.linkedin_alignment;
    if (li) {
      html += '<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border);">';
      html += '<div style="font-size:11px;color:' + (li.aligned?'var(--green)':'var(--warm)') + ';">' + (li.aligned?'\u2713':'\u26a0') + ' LinkedIn: ' + (li.aligned?'Aligned':li.discrepancy_count+' discrepancy(s)') + '</div>';
      if (!li.aligned && li.discrepancies) li.discrepancies.forEach(function(d) {
        html += '<div style="font-size:10px;color:' + (d.severity==='critical'?'var(--red)':'var(--warm)') + ';padding-left:14px;">\u2022 ' + d.field + ': "' + (d.resume_value||'') + '" vs "' + (d.linkedin_value||'') + '"</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  if (data.cover_letter) {
    html += '<details style="margin-top:10px;"><summary style="font-size:11px;font-weight:600;color:var(--text-faint);cursor:pointer;">Cover Letter Preview (' + (data.cover_letter.word_count||'?') + ' words)</summary>';
    html += '<div style="padding:8px;background:var(--bg-main);border:1px solid var(--border);border-radius:0 0 6px 6px;">';
    html += '<div style="font-size:11px;color:var(--text-dim);font-style:italic;">' + (data.cover_letter.salutation||'') + '</div>';
    (data.cover_letter.paragraphs||[]).forEach(function(p) { html += '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.5;">' + p + '</div>'; });
    html += '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">' + (data.cover_letter.closing||'') + '</div>';
    html += '</div></details>';
  }

  // G31: Feedback button
  html += '<div style="margin-top:12px;text-align:center;">';
  html += '<button class="btn btn-sm" onclick="bjShowFeedbackUI(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;border:1px solid var(--border);">\u2b50 Rate & Request Revision</button>';
  html += '</div>';

  // Feedback UI container (hidden initially)
  html += '<div id="feedback-ui-' + stateKey + '" style="display:none;"></div>';

  html += '</div>';
  if (btn) btn.style.display = 'none';
  var resultsDiv = document.createElement('div');
  resultsDiv.innerHTML = html;
  container.appendChild(resultsDiv);
  if (typeof renderResumeCards === 'function') setTimeout(function() { renderResumeCards(); }, 500);
}

// ════════════════════════════════════════════════════════════
// FEEDBACK + ITERATION (G31–G36)
// ════════════════════════════════════════════════════════════

function bjShowFeedbackUI(stateKey) {
  var el = document.getElementById('feedback-ui-' + stateKey);
  if (!el) return;

  var state = window._bjRewriteState[stateKey] || {};
  var fb = state.feedback || { overall: 0, accuracy: 0, relevance: 0, voice: 0, formatting: 0, text: '' };

  var html = '<div style="margin-top:10px;padding:12px;background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:var(--warm);margin-bottom:8px;">How did we do?</div>';

  // Star ratings for 5 dimensions
  var dims = [
    { key: 'overall', label: 'Overall quality' },
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'relevance', label: 'Relevance' },
    { key: 'voice', label: 'Voice & tone' },
    { key: 'formatting', label: 'Formatting' }
  ];

  dims.forEach(function(dim) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">';
    html += '<span style="font-size:11px;color:var(--text-dim);width:90px;">' + dim.label + '</span>';
    for (var s = 1; s <= 5; s++) {
      var filled = s <= (fb[dim.key] || 0);
      html += '<span onclick="bjSetRating(\'' + stateKey + '\',\'' + dim.key + '\',' + s + ')" style="cursor:pointer;font-size:16px;color:' + (filled ? '#f59e0b' : 'var(--border)') + ';" id="star-' + stateKey + '-' + dim.key + '-' + s + '">\u2605</span>';
    }
    html += '<span style="font-size:10px;color:var(--text-faint);" id="star-val-' + stateKey + '-' + dim.key + '">' + (fb[dim.key] || '-') + '/5</span>';
    html += '</div>';
  });

  // Qualitative feedback
  html += '<div style="margin-top:8px;">';
  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;">What would you change?</div>';
  html += '<textarea id="feedback-text-' + stateKey + '" placeholder="E.g.: The skills section feels too generic. I want more emphasis on my AWS work. The second bullet under Company B sounds robotic." style="width:100%;height:60px;padding:6px 8px;font-size:11px;background:var(--bg-main);border:1px solid var(--border);border-radius:4px;color:var(--text);outline:none;resize:vertical;font-family:inherit;">' + (fb.text || '') + '</textarea>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:10px;">';
  html += '<button class="btn btn-sm" onclick="bjSubmitFeedback(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;background:var(--warm);color:#fff;font-weight:600;">Submit Feedback</button>';
  html += '<button class="btn btn-sm" onclick="document.getElementById(\'feedback-ui-' + stateKey + '\').style.display=\'none\'" style="font-size:11px;padding:6px 12px;color:var(--text-faint);">Cancel</button>';
  html += '</div>';

  html += '</div>';
  el.innerHTML = html;
  el.style.display = '';
}

function bjSetRating(stateKey, dim, value) {
  var state = window._bjRewriteState[stateKey] || {};
  if (!state.feedback) state.feedback = {};
  state.feedback[dim] = value;
  window._bjRewriteState[stateKey] = state;

  // Update stars visual
  for (var s = 1; s <= 5; s++) {
    var star = document.getElementById('star-' + stateKey + '-' + dim + '-' + s);
    if (star) star.style.color = s <= value ? '#f59e0b' : 'var(--border)';
  }
  var valEl = document.getElementById('star-val-' + stateKey + '-' + dim);
  if (valEl) valEl.textContent = value + '/5';
}

async function bjSubmitFeedback(stateKey) {
  var state = window._bjRewriteState[stateKey] || {};
  var textEl = document.getElementById('feedback-text-' + stateKey);
  if (textEl) state.feedback.text = textEl.value;

  if (!state.feedback.overall) {
    alert('Please rate overall quality before submitting.');
    return;
  }

  // Save feedback to database
  if (state.rewriteResult && state.rewriteResult.session_id) {
    try {
      var session = await sb.auth.getSession();
      if (session.data.session) {
        var SRK = session.data.session.access_token;
        await sb.from('rewrite_rounds')
          .update({
            rating_overall: state.feedback.overall,
            rating_accuracy: state.feedback.accuracy,
            rating_relevance: state.feedback.relevance,
            rating_voice: state.feedback.voice,
            rating_formatting: state.feedback.formatting,
            feedback_text: state.feedback.text
          })
          .eq('session_id', state.rewriteResult.session_id)
          .eq('round_number', state.rewriteResult.round_number || 1);
      }
    } catch (e) { console.error('[BJ] Feedback save error:', e); }
  }

  // G33: Call Revision Assessor
  var feedbackEl = document.getElementById('feedback-ui-' + stateKey);
  if (feedbackEl) feedbackEl.innerHTML = '<div style="padding:12px;text-align:center;font-size:11px;color:var(--text-faint);">Analyzing your feedback\u2026</div>';

  try {
    var assessSession = await sb.auth.getSession();
    if (!assessSession.data.session) return;

    var assessRes = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + assessSession.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        mode: 'revision-assess',
        resume_sections: state.rewriteResult?.resume_sections,
        feedback: state.feedback
      })
    });

    var assessment = null;
    if (assessRes.ok) {
      var assessData = await assessRes.json();
      assessment = assessData;
    }

    // Show assessment
    bjShowRevisionAssessment(stateKey, state.feedback, assessment);

  } catch (e) {
    console.error('[BJ] Revision assessment error:', e);
    bjShowRevisionAssessment(stateKey, state.feedback, null);
  }
}

function bjShowRevisionAssessment(stateKey, feedback, assessment) {
  var feedbackEl = document.getElementById('feedback-ui-' + stateKey);
  if (!feedbackEl) return;

  var html = '<div style="margin-top:10px;padding:12px;background:rgba(77,142,255,0.04);border:1px solid rgba(77,142,255,0.15);border-radius:8px;">';
  html += '<div style="font-size:12px;font-weight:700;color:#4d8eff;margin-bottom:6px;">\ud83d\udcca Revision Assessment</div>';

  html += '<div style="font-size:11px;color:var(--text-dim);margin-bottom:3px;">Your ratings: ';
  ['overall','accuracy','relevance','voice','formatting'].forEach(function(d) {
    if (feedback[d]) html += d + ': ' + feedback[d] + '/5  ';
  });
  html += '</div>';

  if (assessment && assessment.revision_recommended !== undefined) {
    var confColor = assessment.confidence === 'high' ? 'var(--green)' : assessment.confidence === 'medium' ? 'var(--warm)' : 'var(--text-faint)';
    html += '<div style="margin-top:8px;padding:8px;background:var(--bg-main);border-radius:6px;">';
    html += '<div style="font-size:12px;font-weight:600;color:' + (assessment.revision_recommended ? 'var(--green)' : 'var(--text-faint)') + ';">';
    html += assessment.revision_recommended ? '\u2713 A revision is likely to improve your resume' : '\u2014 A revision may not meaningfully improve the result';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + confColor + ';margin-top:2px;">Confidence: ' + (assessment.confidence || 'unknown') + '</div>';
    if (assessment.confidence_reason) html += '<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">' + assessment.confidence_reason + '</div>';
    if (assessment.suggestion_to_user) html += '<div style="font-size:10px;color:var(--warm);margin-top:4px;">\ud83d\udca1 ' + assessment.suggestion_to_user + '</div>';
    if (assessment.estimated_improvements) {
      html += '<div style="margin-top:6px;">';
      assessment.estimated_improvements.forEach(function(imp) {
        html += '<div style="font-size:10px;color:var(--text-dim);">' + imp.area + ': ' + imp.current_rating + '/5 \u2192 ~' + imp.estimated_after + '/5</div>';
      });
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div style="display:flex;gap:8px;margin-top:10px;">';
  html += '<button class="btn btn-sm" onclick="bjRequestRevision(\'' + stateKey + '\')" style="font-size:11px;padding:6px 16px;background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:600;">\u2728 Request Revision</button>';
  html += '<button class="btn btn-sm" onclick="document.getElementById(\'feedback-ui-' + stateKey + '\').innerHTML=\'<div style=padding:8px;font-size:11px;color:var(--green);text-align:center>\u2713 Feedback saved. Thanks!</div>\'" style="font-size:11px;padding:6px 12px;color:var(--text-faint);">I\'m satisfied</button>';
  html += '</div>';
  html += '</div>';

  feedbackEl.innerHTML = html;
}

// G34: Revision loop — re-runs rewrite pipeline with feedback
async function bjRequestRevision(stateKey) {
  var state = window._bjRewriteState[stateKey] || {};
  if (!state.rewriteResult) return;

  // Update feedback context for the next round
  state.previousFeedback = {
    ratings: state.feedback,
    previous_sections: state.rewriteResult.resume_sections,
    round_number: (state.rewriteResult.round_number || 1) + 1
  };

  // Re-trigger the rewrite with feedback context injected
  var parts = stateKey.split('-');
  var ri = parseInt(parts[0]);
  var fi = parseInt(parts[1]);

  var btn = document.getElementById('feedback-ui-' + stateKey);
  if (btn) btn.innerHTML = '<div style="padding:12px;text-align:center;font-size:11px;color:var(--warm);">Generating revision\u2026 This may take 30-60 seconds.</div>';

  var filterNames = Object.keys(scores[ri]?.filters || {});
  var filterScore = scores[ri]?.filters[filterNames[fi]];
  if (!filterScore) return;

  var acceptedRecs = [];
  Object.keys(state.accepted || {}).forEach(function(k) {
    if (state.accepted[k]) acceptedRecs.push({ id: k, type: k.split('-')[0], user_input: (state.achievementInputs||{})[k] || null });
  });

  var r = resumes[ri];
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resume_text: r?.extractedText || '',
        resume_profile: filterScore.resumeProfile,
        jd_profile: filterScore.jdProfile,
        accepted_recommendations: acceptedRecs,
        achievement_inputs: state.achievementInputs || {},
        gap_answers: state.gapAnswers || {},
        user_highlights: state.userHighlights || [],
        user_notes: state.userNotes || '',
        include_cover_letter: state.coverLetter || false,
        template_id: state.template || 'executive',
        filter_name: filterNames[fi] || 'General',
        coaching: filterScore.coaching,
        previous_feedback: state.previousFeedback,
        round_number: (state.rewriteResult.round_number || 1) + 1
      })
    });

    if (!res.ok) {
      if (btn) btn.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--red);">Revision failed. Try again.</div>';
      return;
    }

    var data = await res.json();
    state.rewriteResult = data;

    // Clear old results and show new ones
    var container = document.getElementById('acceptance-ui-' + stateKey);
    if (container) {
      var oldResults = container.querySelectorAll('div[style*="rgba(34,197,94"]');
      oldResults.forEach(function(el) { el.remove(); });
    }
    bjShowRewriteResults(stateKey, ri, fi, data);

  } catch (e) {
    console.error('[BJ] Revision error:', e);
    if (btn) btn.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--red);">Error: ' + e.message + '</div>';
  }
}

async function bjInitRewriteFlow(ri, fi, filterScore) {
  var stateKey = ri + '-' + fi;

  // Only for premium results with coaching
  if (!filterScore || !filterScore.premium || !filterScore.coaching) return;

  // Check if gap interview container exists
  var gapContainer = document.getElementById('gap-interview-container-' + stateKey);
  if (!gapContainer) return;

  // Fetch gap interview questions
  if (filterScore.gapAnalysis && filterScore.gapAnalysis.length > 0) {
    gapContainer.innerHTML = '<div style="font-size:10px;color:var(--text-faint);padding:8px;">Loading gap questions\u2026</div>';
    var gapQuestions = await fetchGapInterview(filterScore.gapAnalysis, filterScore.resumeProfile);
    if (gapQuestions && gapQuestions.length > 0) {
      gapContainer.innerHTML = buildGapInterviewHtml(ri, fi, gapQuestions);
      window._bjRewriteState[stateKey] = window._bjRewriteState[stateKey] || {};
      window._bjRewriteState[stateKey].gapQuestions = gapQuestions;
    } else {
      gapContainer.innerHTML = '';
      bjShowAcceptanceUI(stateKey);
    }
  } else {
    gapContainer.innerHTML = '';
    bjShowAcceptanceUI(stateKey);
  }
}

// Update readiness side panels after analysis completes
function updateReadinessSidePanels(scores) {
  if (!scores) return;
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var existing = document.getElementById('readiness-side-' + ri);
    if (existing) {
      var tmp = document.createElement('div');
      tmp.innerHTML = buildReadinessSide(ri, scores[ri]);
      existing.replaceWith(tmp.firstChild);
    }

    // Initialize gap interview + acceptance UI for premium results
    var data = scores[ri];
    if (data && data.filters) {
      var filterNames = Object.keys(data.filters);
      for (var fi = 0; fi < filterNames.length; fi++) {
        var fs = data.filters[filterNames[fi]];
        if (fs && fs.premium && fs.coaching) {
          bjInitRewriteFlow(ri, fi, fs);
        }
      }
    }
  }
}

function renderReadinessResults(scores) {
  var el = document.getElementById('readiness-results');
  if (!el) return;
  if (!scores || Object.keys(scores).length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text-faint);padding:12px 0;">No resumes with assigned filters found. Assign resumes to filters in the cards below, then analyze.</div>';
    return;
  }

  var html = '';
  var indices = Object.keys(scores);
  for (var si = 0; si < indices.length; si++) {
    var ri = indices[si];
    var data = scores[ri];
    var overallColor = data.overallScore >= 70 ? 'var(--green)' : data.overallScore >= 40 ? 'var(--warm)' : 'var(--red)';
    var overallLabel = data.overallScore >= 70 ? 'Ready' : data.overallScore >= 40 ? 'Gaps' : 'Weak';

    html += '<div style="border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:12px;background:var(--bg-input);">';
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">';
    html += '<div style="font-family:var(--mono);font-size:28px;font-weight:700;color:' + overallColor + ';">' + data.overallScore + '%</div>';
    html += '<div><div style="font-size:13px;font-weight:600;color:var(--text);">' + data.resumeName + '</div>';
    html += '<div style="font-size:11px;color:' + overallColor + ';font-weight:500;">' + overallLabel + '</div></div></div>';

    // Per-filter breakdown
    var filterNames = Object.keys(data.filters);
    for (var fi = 0; fi < filterNames.length; fi++) {
      var fname = filterNames[fi];
      var fs = data.filters[fname];
      var fc = fs.score >= 70 ? 'var(--green)' : fs.score >= 40 ? 'var(--warm)' : 'var(--red)';
      var detailId = 'rd-detail-' + ri + '-' + fi;
      html += '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border);">';

      // Score header row
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
      html += '<span style="font-family:var(--mono);font-size:13px;font-weight:600;color:' + fc + ';">' + fs.score + '%</span>';
      html += '<span style="font-size:12px;font-weight:600;color:var(--text);">' + fname + '</span>';
      html += '<span style="font-size:10px;color:var(--text-faint);">' + fs.matched + '/' + fs.total + ' terms \u00b7 ' + fs.jdsAnalyzed + ' JDs</span>';
      html += '<span onclick="document.getElementById(\'' + detailId + '\').style.display=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'\':\'none\';this.textContent=document.getElementById(\'' + detailId + '\').style.display===\'none\'?\'Show keywords \u25b8\':\'Hide keywords \u25be\'" style="font-size:10px;color:var(--accent);cursor:pointer;margin-left:auto;font-weight:500;">Show keywords \u25b8</span>';
      html += '</div>';

      // Inline missing preview (top 5 missing, always visible)
      if (fs.topMissing.length > 0) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;">';
        var previewCount = Math.min(5, fs.topMissing.length);
        for (var mi = 0; mi < previewCount; mi++) {
          var mt = typeof fs.topMissing[mi] === 'object' ? fs.topMissing[mi].term : fs.topMissing[mi];
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">\u2717 ' + mt + '</span>';
        }
        if (fs.topMissing.length > 5) {
          html += '<span style="font-size:10px;color:var(--text-faint);">+' + (fs.topMissing.length - 5) + ' more</span>';
        }
        html += '</div>';
      }

      // Expandable keyword detail
      html += '<div id="' + detailId + '" style="display:none;margin-top:10px;">';

      // Legend
      html += '<div style="font-size:9px;color:var(--text-faint);margin-bottom:8px;">';
      html += '<span style="color:var(--green);">\u2713 green</span> = in your resume \u00a0 ';
      html += '<span style="color:var(--red);">\u2717 red</span> = missing \u2014 add these to improve your match';
      html += '</div>';

      // Skills (unigrams)
      html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">Skills &amp; Tools</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">';
      // Matched first
      for (var gi = 0; gi < fs.topMatched.length; gi++) {
        var gterm = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].term : fs.topMatched[gi];
        var gcount = typeof fs.topMatched[gi] === 'object' ? fs.topMatched[gi].count : '';
        html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">';
        html += '\u2713 ' + gterm;
        if (gcount) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + gcount + '</span>';
        html += '</span>';
      }
      // Then missing
      for (var ri2 = 0; ri2 < fs.topMissing.length; ri2++) {
        var rterm = typeof fs.topMissing[ri2] === 'object' ? fs.topMissing[ri2].term : fs.topMissing[ri2];
        var rcount = typeof fs.topMissing[ri2] === 'object' ? fs.topMissing[ri2].count : '';
        html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">';
        html += '\u2717 ' + rterm;
        if (rcount) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + rcount + '</span>';
        html += '</span>';
      }
      html += '</div>';

      // Bigrams (2-word phrases)
      var hasBigrams = (fs.bigramMatched && fs.bigramMatched.length > 0) || (fs.bigramMissing && fs.bigramMissing.length > 0);
      if (hasBigrams) {
        html += '<div style="font-size:10px;font-weight:600;color:var(--text-dim);margin-bottom:4px;">2-Word Phrases</div>';
        html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
        var bm = fs.bigramMatched || [];
        for (var bi = 0; bi < bm.length; bi++) {
          var bt = typeof bm[bi] === 'object' ? bm[bi].term : bm[bi];
          var bcc = typeof bm[bi] === 'object' ? bm[bi].count : '';
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);color:var(--green);">';
          html += '\u2713 ' + bt;
          if (bcc) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + bcc + '</span>';
          html += '</span>';
        }
        var bmiss = fs.bigramMissing || [];
        for (var bmi = 0; bmi < bmiss.length; bmi++) {
          var bmt = typeof bmiss[bmi] === 'object' ? bmiss[bmi].term : bmiss[bmi];
          var bmcc = typeof bmiss[bmi] === 'object' ? bmiss[bmi].count : '';
          html += '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);color:var(--red);">';
          html += '\u2717 ' + bmt;
          if (bmcc) html += ' <span style="font-family:var(--mono);font-size:9px;opacity:0.7;">' + bmcc + '</span>';
          html += '</span>';
        }
        html += '</div>';
      }

      html += '</div>'; // close detail
      html += '</div>'; // close filter block
    }

    // Level analysis
    var levelLabels = Object.keys(data.levels);
    if (levelLabels.length > 0) {
      html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
      html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-bottom:8px;">Level Fit</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
      for (var li = 0; li < levelLabels.length; li++) {
        var lbl = levelLabels[li];
        var ls = data.levels[lbl];
        var lc = ls.score >= 70 ? 'var(--green)' : ls.score >= 40 ? 'var(--warm)' : 'var(--red)';
        html += '<div style="padding:6px 10px;border-radius:8px;background:var(--bg-card);border:1px solid var(--border);text-align:center;min-width:80px;">';
        html += '<div style="font-family:var(--mono);font-size:14px;font-weight:700;color:' + lc + ';">' + ls.score + '%</div>';
        html += '<div style="font-size:10px;color:var(--text-dim);">' + lbl + '</div>';
        html += '<div style="font-size:9px;color:var(--text-faint);">' + ls.jobCount + ' jobs</div>';
        html += '</div>';
      }
      html += '</div></div>';
    }

    html += '</div>';
  }

  el.innerHTML = html;
}

// Show readiness panel on Resumes page when there are cached results
function initReadinessPanel() {
  var panel = document.getElementById('readiness-panel');
  if (!panel) return;
  var sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  var hasAssigned = resumes.some(function(r, i){
    return !r.archived && r.keywords && r.keywords.length > 0 && (r.filterIds || []).length > 0;
  });
  if (hasAssigned) {
    panel.style.display = '';
    if (readinessCache && readinessCache.scores) {
      // Show cached results immediately
      updateResumeCardGrades(readinessCache.scores);
      renderReadinessResults(readinessCache.scores);
      var statusEl = document.getElementById('readiness-status');
      if (statusEl && readinessCache.lastRun) {
        var ago = Math.round((Date.now() - new Date(readinessCache.lastRun).getTime()) / 60000);
        statusEl.textContent = ago < 60 ? ago + 'm ago' : ago < 1440 ? Math.round(ago / 60) + 'h ago' : Math.round(ago / 1440) + 'd ago';
      }
      var btn = document.getElementById('readiness-run-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'Analyze All'; }

      // Auto-refresh if cache is older than 24 hours
      var cacheAge = readinessCache.lastRun ? Date.now() - new Date(readinessCache.lastRun).getTime() : Infinity;
      if (cacheAge > 24 * 60 * 60 * 1000) {
        setTimeout(function(){ runReadinessAnalysis({ silent: true }); }, 500);
      }
    } else {
      // No cache — auto-run in background
      setTimeout(function(){ runReadinessAnalysis({ silent: false }); }, 500);
    }
  } else {
    panel.style.display = 'none';
  }
}

// Stubs for removed functions
function toggleKeywordPanel() {}
function refreshKeywordsIfOpen() {
  // After job rows render, compute match scores for visible jobs
  computeVisibleJobScores();
}

// Scroll to readiness panel and expand the detail for a given resume
function scrollToReadinessDetail(resumeIdx) {
  var panel = document.getElementById('readiness-panel');
  if (!panel) return;
  panel.style.display = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Expand all detail sections for this resume
  if (readinessCache && readinessCache.scores && readinessCache.scores[resumeIdx]) {
    var filterCount = Object.keys(readinessCache.scores[resumeIdx].filters).length;
    for (var fi = 0; fi < filterCount; fi++) {
      var detailEl = document.getElementById('rd-detail-' + resumeIdx + '-' + fi);
      if (detailEl) detailEl.style.display = '';
    }
  }
}

// Event delegation for job title clicks — opens full modal
document.addEventListener('click', e => {
  const link = e.target.closest('.job-title-link');
  if (link && link.dataset.jobid) {
    e.preventDefault();
    openJobModal(link.dataset.jobid);
  }
  // "→" click in preview snippet opens modal
  const more = e.target.closest('.preview-more');
  if (more && more.dataset.jobid) {
    e.preventDefault();
    openJobModal(more.dataset.jobid);
  }
});

// Global preview toggle — shows one-line description snippets under each title
function initPreviewToggle() {
  const toggle = $('#preview-toggle');
  if (!toggle) return;

  // Restore saved preference
  if (localStorage.getItem('bj_show_previews') === '1') {
    toggle.checked = true;
    $('#job-table')?.classList.add('show-previews');
  }

  toggle.addEventListener('change', () => {
    const table = $('#job-table');
    if (toggle.checked) {
      table.classList.add('show-previews');
      localStorage.setItem('bj_show_previews', '1');
      loadPreviewSnippets();
    } else {
      table.classList.remove('show-previews');
      localStorage.setItem('bj_show_previews', '0');
    }
  });
}

// Strip common Greenhouse slug suffixes from company names
function cleanCompanyName(name) {
  if (!name) return '';
  let n = name;
  // Remove common slug junk suffixes (case-insensitive, greedy)
  n = n.replace(/\s*(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|hr|apply(?:now)?|greenhouse|workday|ats)\s*$/i, '');
  // Repeat in case of stacking: "companyjobsapplynow" → strip "applynow" then "jobs"
  n = n.replace(/(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|hr|apply(?:now)?|greenhouse|workday|ats)$/i, '');
  n = n.replace(/(jobs?apply(?:now)?|careers?|jobs?|hiring|recruit(?:ing|ment)?|talent|apply(?:now)?)$/i, '');
  return n.trim() || name;
}
function extractSnippet(html, maxLen) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  const text = div.textContent || div.innerText || '';
  // Clean up whitespace
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) : clean;
}

// Load preview snippets for all visible jobs
async function loadPreviewSnippets() {
  const snippetEls = document.querySelectorAll('.job-snippet-text[data-preview-id]');
  if (!snippetEls.length) return;

  for (const el of snippetEls) {
    const jobId = el.dataset.previewId;
    if (el.dataset.loaded === '1') continue; // Already loaded

    const job = allJobs.find(j => j.greenhouse_id === jobId);
    let content = job?.content || null;

    if (content) {
      // Already cached — render immediately
      const snippet = extractSnippet(content, 300);
      el.textContent = snippet;
      const arrow = document.createElement('span');
      arrow.className = 'preview-more';
      arrow.dataset.jobid = jobId;
      arrow.textContent = ' →';
      el.appendChild(arrow);
      el.dataset.loaded = '1';
    } else {
      // Mark as loading, fetch in background
      el.innerHTML = '<span style="opacity:0.4;">loading…</span>';

      // Fetch from Greenhouse API
      try {
        const jobUrl = job?.url || '';
        const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
        let apiUrl = null;
        if (urlMatch) {
          apiUrl = `https://boards-api.greenhouse.io/v1/boards/${urlMatch[1]}/jobs/${urlMatch[2]}`;
        } else if (job?.company_slug) {
          apiUrl = `https://boards-api.greenhouse.io/v1/boards/${job.company_slug}/jobs/${jobId}`;
        }

        if (apiUrl) {
          const resp = await fetch(apiUrl);
          if (resp.ok) {
            const data = await resp.json();
            if (data.content) {
              content = decodeJobContent(data.content);
              if (job) job.content = content;
              enrichJob(jobId, { content });

              // Extract salary while we have it
              if (job && !job.salary_min) {
                const salary = parseSalaryFromContent(content);
                if (salary) {
                  job.salary_min = salary.min;
                  job.salary_max = salary.max;
                  job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
                  enrichJob(jobId, { salary: { min: salary.min, max: salary.max, raw: salary.raw, currency: salary.currency || 'USD', rate: salary.rate || 'yr' } });
                  const cell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
                  if (cell) cell.textContent = formatSalaryCell(job);
                }
              }
            }
          }
        }
      } catch (e) {
        // Silently skip
      }

      if (content) {
        const snippet = extractSnippet(content, 300);
        el.textContent = snippet;
        const arrow = document.createElement('span');
        arrow.className = 'preview-more';
        arrow.dataset.jobid = jobId;
        arrow.textContent = ' →';
        el.appendChild(arrow);
        // Content just arrived — compute match score for this job
        computeVisibleJobScores();
      } else {
        el.innerHTML = '<span style="opacity:0.3;">no description available</span>';
      }
      el.dataset.loaded = '1';

      // Small delay between API calls
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

// Initialize preview toggle after DOM ready
setTimeout(initPreviewToggle, 100);

// Robust HTML content decoder — handles any level of entity encoding
// Check if job content is a sentinel indicating the ATS listing was removed (404/410)
function isContentUnavailable(content) {
  return content === '<!-- unavailable -->';
}

function decodeJobContent(raw) {
  if (!raw) return '';
  let html = raw;
  // Keep decoding until stable (handles double/triple encoding)
  for (let i = 0; i < 5; i++) {
    if (!html.includes('&lt;') && !html.includes('&amp;') && !html.includes('&#')) break;
    const tmp = document.createElement('textarea');
    tmp.innerHTML = html;
    const decoded = tmp.value;
    if (decoded === html) break; // stable
    html = decoded;
  }
  // A10: Sanitize decoded HTML via DOMPurify to prevent XSS from ATS-sourced content
  return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] }) : html;
}

// Job Spec Modal
async function openJobModal(jobId, e) {
  if (e) e.preventDefault();
  console.log('[BJ] openJobModal called with:', jobId);
  const overlay = $('#job-modal-overlay');
  const titleEl = $('#job-modal-title');
  const metaEl = $('#job-modal-meta');
  const bodyEl = $('#job-modal-body');
  const footerEl = $('#job-modal-footer');
  const extLink = $('#job-modal-external');

  // Look up from cached results — instant, no extra fetch
  let job = allJobs.find(j => j.greenhouse_id === jobId);
  if (!job) {
    // Fallback: quick fetch just this one row
    const { data } = await sb.from('ats_jobs').select('*').eq('greenhouse_id', jobId).single();
    job = data;
  }

  // Show modal
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  if (!job) {
    titleEl.textContent = 'Job not found';
    metaEl.textContent = '';
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);">This job could not be loaded.</div>';
    footerEl.innerHTML = '<button class="job-modal-close-btn" onclick="closeJobModal()">Close</button>';
    extLink.href = '#';
    return;
  }

  // Build proper URL
  const jobUrl = job.url && job.url.startsWith('http') ? job.url : job.url ? 'https://boards.greenhouse.io' + job.url : '#';

  // Populate header
  titleEl.textContent = job.title || 'Untitled';
  const metaParts = [job.company_name, formatLocation(job.location, job.loc_display)].filter(Boolean);
  if (job.department) metaParts.push(job.department);
  metaEl.textContent = metaParts.join('  \u00b7  ');
  extLink.href = jobUrl;

  // Populate body — robust decode that handles any level of HTML encoding
  const rawContent = job.content || job.description || null;
  if (rawContent && !isContentUnavailable(rawContent)) {
    bodyEl.innerHTML = decodeJobContent(rawContent);
    // Parse salary from cached content if not already parsed
    if (!job.salary_min) {
      const salary = parseSalaryFromContent(rawContent);
      if (salary) {
        job.salary_min = salary.min;
        job.salary_max = salary.max;
        job.salary_currency = salary.currency || 'USD'; job.salary_rate = salary.rate || 'yr';
        console.log(`[BJ] Salary extracted (cached): ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k from "${salary.raw}"`);
        enrichJob(jobId, { salary: { min: salary.min, max: salary.max, raw: salary.raw, currency: salary.currency || 'USD', rate: salary.rate || 'yr' } });
        // Update salary cell in feed
        const row = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
        if (row) row.textContent = formatSalaryCell(job);
      }
    }
  } else {
    // Show loading state and fetch on demand
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:0 auto 12px;"></div><div style="color:var(--text-faint);font-size:13px;">Loading job details…</div></div>';
    fetchJobSpec(jobId, jobUrl, bodyEl);
  }

  // Store for toggle between spec and form
  window._modalJobUrl = jobUrl;
  window._modalJobId = jobId;
  window._modalShowingForm = false;

  // Footer with action buttons — all sync back to feed
  const isSaved = savedJobIds.includes(jobId);
  const isApplied = appliedJobIds.includes(jobId);
  let footerHtml = '';
  if (isApplied) {
    footerHtml += '<span class="job-action-btn applied-btn">Applied ✓</span>';
  } else {
    // Build embed URL for Greenhouse iframe form
    const embedMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
    if (embedMatch) {
      footerHtml += '<button class="apply-btn apply-btn-default" id="modal-apply-here" onclick="toggleApplyForm()" style="padding:6px 16px;font-size:12px;">Apply</button>';
    } else {
      // No embeddable form — show ATS link as primary
      footerHtml += '<a href="' + jobUrl + '" target="_blank" rel="noopener" class="apply-btn apply-btn-default" style="padding:6px 16px;font-size:12px;text-decoration:none;">Apply on ATS ↗</a>';
    }
    const saveClass = isSaved ? 'job-action-btn saved-btn' : 'job-action-btn';
    const saveLabel = isSaved ? 'In Pipeline' : 'Add to Pipeline';
    footerHtml += '<button class="' + saveClass + '" id="modal-save-btn" onclick="modalSave(\'' + jobId + '\', this)">' + saveLabel + '</button>';
  }
  footerHtml += '<button class="job-action-btn hide-btn" onclick="modalHide(\'' + jobId + '\')" style="padding:4px 10px;font-size:11px;">Hide</button>';
  // AI Score button (Pro users with assigned resume)
  var userPlan = window._bjUserPlan || 'free';
  if (userPlan === 'pro' || userPlan === 'enterprise') {
    footerHtml += '<button class="job-action-btn" onclick="aiScoreJob(\'' + jobId + '\')" id="ai-score-btn" style="padding:4px 10px;font-size:11px;border-color:var(--accent);color:var(--accent);">AI Score</button>';
  }
  footerHtml += '<button class="job-modal-close-btn" onclick="closeJobModal()" style="margin-left:auto;">Close</button>';
  footerEl.innerHTML = footerHtml;

  // AI score result container
  var aiContainer = document.createElement('div');
  aiContainer.id = 'ai-score-result';
  footerEl.parentNode.insertBefore(aiContainer, footerEl);
}

// ─── Per-job AI scoring from modal ───
async function aiScoreJob(jobId) {
  var btn = document.getElementById('ai-score-btn');
  var resultEl = document.getElementById('ai-score-result');
  if (btn) { btn.disabled = true; btn.textContent = 'Scoring\u2026'; }

  // Find assigned resume for this job's filter
  var resume = null;
  var storedResumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');
  if (storedResumes.length > 0) resume = storedResumes[0]; // Use first resume as default

  if (!resume || !resume.extractedText) {
    if (resultEl) resultEl.innerHTML = '<div style="font-size:12px;color:var(--text-faint);padding:8px 0;">No resume text available for AI scoring</div>';
    if (btn) { btn.disabled = false; btn.textContent = 'AI Score'; }
    return;
  }

  var result = await fetchAIScore({
    resume_text: resume.extractedText,
    resume_keywords: resume.keywords || [],
    mode: 'single',
    job_ids: [jobId],
    max_jds: 1
  });

  if (btn) { btn.disabled = false; btn.textContent = 'AI Score'; }

  if (!result || !result.ai) {
    if (resultEl) resultEl.innerHTML = '<div style="font-size:12px;color:var(--red);padding:8px 0;">AI scoring failed — try again</div>';
    return;
  }

  // Render rich result
  var g = scoreToGrade(result.score);
  var html = '<div style="margin:8px 0;padding:12px;background:var(--bg-input);border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">';
  html += '<span style="font-size:28px;font-weight:700;color:' + g.color + ';font-family:var(--mono)">' + g.grade + '</span>';
  html += '<span style="font-size:14px;color:var(--text)">' + (result.fitStatus || '') + '</span>';
  html += '</div>';
  html += '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">' + (result.summary || '') + '</p>';

  if (result.topMissing && result.topMissing.length > 0) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Missing skills:</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">';
    result.topMissing.forEach(function(s) {
      html += '<span style="font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.2)">' + s.term + '</span>';
    });
    html += '</div>';
  }

  if (result.recommendations && result.recommendations.word_usage) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Rewrite tips:</div>';
    result.recommendations.word_usage.forEach(function(tip) {
      html += '<div style="font-size:11px;color:var(--text-dim);padding-left:8px">\u2192 ' + tip + '</div>';
    });
  }

  html += '</div>';
  if (resultEl) resultEl.innerHTML = html;

  // PostHog
  if (typeof posthog !== 'undefined') {
    posthog.capture('ai_score_completed', { mode: 'single', score: result.score, ai: true });
  }
}


function closeJobModal(e) {
  if (e && e.target !== e.currentTarget) return;
  $('#job-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
  window._modalShowingForm = false;
}

// Toggle between job spec view and embedded Greenhouse application form
function toggleApplyForm() {
  const bodyEl = $('#job-modal-body');
  const btn = $('#modal-apply-here');
  const jobUrl = window._modalJobUrl;
  const jobId = window._modalJobId;

  if (window._modalShowingForm) {
    // Switch back to job spec
    window._modalShowingForm = false;
    btn.textContent = 'Apply';
    btn.style.background = '';
    btn.style.color = '';
    // Re-trigger the spec load
    const job = allJobs.find(j => j.greenhouse_id === jobId);
    if (job?.content && !isContentUnavailable(job.content)) {
      bodyEl.innerHTML = decodeJobContent(job.content);
    } else if (job?.content && isContentUnavailable(job.content)) {
      bodyEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);font-size:13px;">This job listing is no longer available on the company\'s careers page.</div>';
    } else {
      bodyEl.innerHTML = '<div style="text-align:center;padding:40px;"><div class="loading-spinner" style="margin:0 auto 12px;"></div><div style="color:var(--text-faint);font-size:13px;">Loading job details…</div></div>';
      fetchJobSpec(jobId, jobUrl, bodyEl);
    }
    return;
  }

  // Switch to application form
  window._modalShowingForm = true;
  btn.textContent = '← Back to Job Spec';
  btn.style.background = 'none';
  btn.style.color = 'var(--accent)';

  // Build Greenhouse embed URL
  const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
  if (urlMatch) {
    const [, boardToken, numId] = urlMatch;
    const embedUrl = `https://boards.greenhouse.io/embed/job_app?for=${boardToken}&token=${numId}`;
    bodyEl.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;min-height:500px;">
        <div style="font-size:12px;color:var(--text-faint);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">
          Complete your application below — this form submits directly to the company's hiring system
        </div>
        <iframe id="gh-apply-frame" src="${embedUrl}" style="flex:1;border:none;border-radius:8px;min-height:500px;width:100%;background:#fff;" 
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-top-navigation"
          loading="lazy"></iframe>
      </div>`;

    // Watch for successful submission — Greenhouse shows a confirmation page after submit
    // We detect this by polling iframe height changes or watching for the frame to reload
    const frame = $('#gh-apply-frame');
    let pollCount = 0;
    const submissionPoller = setInterval(() => {
      pollCount++;
      if (pollCount > 600) { clearInterval(submissionPoller); return; } // stop after 10 min
      try {
        // Cross-origin: can't read URL, but we can detect if content shrinks
        // (confirmation page is much shorter than the application form)
        // Also try to detect via frame load events
      } catch(e) {}
    }, 1000);

    // Listen for the iframe to load a new page (confirmation page after submission)
    let frameLoads = 0;
    frame.addEventListener('load', () => {
      frameLoads++;
      if (frameLoads > 1) {
        // Second load = form was submitted and confirmation page loaded
        clearInterval(submissionPoller);
        markAppliedFromModal(jobId);
      }
    });
  }
}

// On-demand job spec fetcher — tries Greenhouse JSON API first
// Salary parser — extract salary range from job description HTML
// Finds ALL salary ranges (handles multi-zone postings) and returns lowest min / highest max
// Detects rate type: annual, hourly, weekly, monthly
// Rejects: commission disclosures, franchise FDDs
function parseSalaryFromContent(html) {
  if (!html) return null;
  // Strip HTML tags for cleaner regex matching
  let text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  // Decode common HTML entities that appear in salary ranges
  text = text.replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&#8212;/g, '—').replace(/&#8211;/g, '–');
  text = text.replace(/\s+/g, ' ');
  // Normalize space-separated thousands to comma-separated (e.g. "$95 000" → "$95,000")
  text = text.replace(/(\$|£|€|CA\$|AU\$|US\$)\s*(\d{1,3})((?:\s\d{3})+)(?=\.\d{2}|\s|$|[^0-9])/g, function(m, sym, first, rest) {
    return sym + first + rest.replace(/\s/g, ',');
  });

  // Early exit: skip franchise disclosure documents entirely
  if (/franchise\s+disclosure|franchisee|reporting\s+publications?|item\s+19\b/i.test(text)) {
    if (/average\s+(?:commission|yearly|annual).*\$[\d,]+/i.test(text)) {
      return null;
    }
  }

  const allRanges = [];

  // Currency symbol pattern: matches $, CA$, C$, A$, AU$, NZ$, HK$, £, €
  const currSym = '(?:CA\\$|C\\$|A\\$|AU\\$|NZ\\$|HK\\$|US\\$|£|€|\\$)';

  // Rate detection patterns — check surrounding context
  const ratePatterns = [
    { pattern: /per\s+hour|\/\s*(?:hr|hour|h)\b|hourly/i, rate: 'hr' },
    { pattern: /per\s+week|\/\s*(?:wk|week)\b|weekly/i, rate: 'wk' },
    { pattern: /per\s+month|\/\s*(?:mo|month|mth)\b|monthly/i, rate: 'mo' },
    { pattern: /per\s+day|\/\s*(?:day|d)\b|per\s+diem|daily/i, rate: 'day' },
    { pattern: /per\s+session|\/\s*session/i, rate: 'session' },
    { pattern: /per\s+visit|\/\s*visit/i, rate: 'visit' },
  ];
  const commissionPattern = /commission|franchisee|earnings\s+claim|franchise\s+disclosure/i;

  // Helper: detect rate type from surrounding text
  function detectRate(matchIndex, matchLen) {
    const afterText = text.slice(matchIndex, matchIndex + matchLen + 80);
    const beforeText = text.slice(Math.max(0, matchIndex - 80), matchIndex + matchLen);
    for (const rp of ratePatterns) {
      if (rp.pattern.test(afterText) || rp.pattern.test(beforeText)) return rp.rate;
    }
    return 'yr'; // default annual
  }

  // Helper: check if context suggests commission/franchise disclosure
  function isCommission(matchIndex, matchLen) {
    const beforeText = text.slice(Math.max(0, matchIndex - 80), matchIndex + matchLen);
    return commissionPattern.test(beforeText);
  }

  // Also detect currency for metadata
  let detectedCurrency = 'USD'; // default
  if (/CA\$|C\$|\bCAD\b/i.test(text)) detectedCurrency = 'CAD';
  else if (/£|\bGBP\b/i.test(text)) detectedCurrency = 'GBP';
  else if (/€|\bEUR\b/i.test(text)) detectedCurrency = 'EUR';
  else if (/A\$|AU\$|\bAUD\b/i.test(text)) detectedCurrency = 'AUD';

  // Patterns to match salary/rate ranges
  const rangePatterns = [
    // "$120,000 - $150,000" or "$77 - $96" or "$77.00 to $96.00" or "$49,530 USD to $149,243 USD"
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:USD|CAD|GBP|EUR|AUD)?\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:year|hour|hr|week|wk|month|mo|day|session|visit)|annually|annual|hourly|weekly|monthly|\\/\\s*(?:yr|year|hr|hour|h|wk|week|mo|month|mth|day|d)|USD|CAD|GBP|EUR)?', 'gi'),
    // "$120k - $150k"
    new RegExp(currSym + '\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]\\s*(?:USD|CAD|GBP|EUR|AUD)?\\s*(?:[-–—]|to)\\s*' + currSym + '?\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]', 'gi'),
  ];

  for (const pattern of rangePatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      if (isCommission(match.index, match[0].length)) continue;

      let min = parseFloat(match[1].replace(/,/g, ''));
      let max = parseFloat(match[2].replace(/,/g, ''));
      // Handle "k" notation
      if (min < 1000 && max < 1000 && match[0].toLowerCase().includes('k')) { min *= 1000; max *= 1000; }

      const rate = detectRate(match.index, match[0].length);

      // Sanity checks per rate type
      let valid = false;
      if (rate === 'yr') {
        // Annual: $20k-$2M, apply k-multiplier for small numbers without explicit k
        if (min < 1000) min *= 1000;
        if (max < 1000) max *= 1000;
        valid = min >= 20000 && min <= 2000000 && max >= min && max <= 2000000;
      } else if (rate === 'hr') {
        valid = min >= 10 && min <= 1000 && max >= min && max <= 1000;
      } else if (rate === 'day') {
        valid = min >= 50 && min <= 5000 && max >= min && max <= 5000;
      } else if (rate === 'wk') {
        valid = min >= 200 && min <= 20000 && max >= min && max <= 20000;
      } else if (rate === 'mo') {
        valid = min >= 1000 && min <= 100000 && max >= min && max <= 100000;
      } else if (rate === 'session' || rate === 'visit') {
        valid = min >= 10 && min <= 2000 && max >= min && max <= 2000;
      }

      if (valid) {
        allRanges.push({ min: Math.round(min), max: Math.round(max), raw: match[0].trim(), currency: detectedCurrency, rate });
      }
    }
  }

  // If we found ranges, return the envelope (lowest min, highest max) — group by rate type
  // Prefer annual ranges if mixed; otherwise use whatever we found
  if (allRanges.length > 0) {
    const annualRanges = allRanges.filter(r => r.rate === 'yr');
    const bestRanges = annualRanges.length > 0 ? annualRanges : allRanges;
    // Use only ranges of the same rate type
    const rateType = bestRanges[0].rate;
    const sameRate = bestRanges.filter(r => r.rate === rateType);

    const lowestMin = Math.min(...sameRate.map(r => r.min));
    const highestMax = Math.max(...sameRate.map(r => r.max));
    const currency = sameRate[0].currency;
    const prefMap = { CAD: 'CA$', GBP: '£', EUR: '€', AUD: 'AU$' };
    const sym = prefMap[currency] || '$';
    const raw = sameRate.length > 1
      ? `${sameRate.length} zones: ${sym}${(lowestMin/1000).toFixed(0)}k-${sym}${(highestMax/1000).toFixed(0)}k`
      : sameRate[0].raw;
    return { min: lowestMin, max: highestMax, raw, currency, rate: rateType };
  }

  // Single value patterns: "$150,000" or "$150k" or "CA$150,000"
  // Only match when preceded by salary/compensation/pay keywords
  const singlePatterns = [
    new RegExp('(?:base\\s+(?:salary|pay|compensation)[:\\s]*)' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:year|hour|hr|week|month)|annually|annual|hourly|\\/\\s*(?:yr|year|hr|hour))?', 'gi'),
    new RegExp('(?:salary|compensation|pay\\s+range|pay)[:\\s]*' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)', 'gi'),
    new RegExp('(?:salary|compensation|pay\\s+range|pay)[:\\s]*' + currSym + '\\s*(\\d+(?:\\.\\d+)?)\\s*[kK]', 'gi'),
    // "Up to $232 per hour" — common pattern for single-value rates
    new RegExp('(?:up\\s+to|starting\\s+at|from)\\s+' + currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*(?:per\\s+(?:hour|hr|week|wk|month|mo|day|session|visit)|hourly|\\/\\s*(?:hr|hour|h|wk|mo))', 'gi'),
    // Standalone "$45/hr" or "$60/hour" or "$5,000/mo" — no keyword prefix needed when rate is explicit
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s*\\/\\s*(?:hr|hour|h|wk|week|mo|month|mth|day|d|yr|year)', 'gi'),
    // Standalone "$45 per hour" or "$60 per week"
    new RegExp(currSym + '\\s*([\\d,]+(?:\\.\\d{2})?)\\s+per\\s+(?:hour|hr|week|wk|month|mo|day|session|visit|year|yr|annum)', 'gi'),
  ];
  for (const pattern of singlePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      if (isCommission(match.index, match[0].length)) continue;

      const rate = detectRate(match.index, match[0].length);
      let val = parseFloat(match[1].replace(/,/g, ''));

      let valid = false;
      if (rate === 'yr') {
        if (val < 1000) val *= 1000;
        valid = val >= 20000 && val <= 2000000;
      } else if (rate === 'hr') {
        valid = val >= 10 && val <= 1000;
      } else if (rate === 'day') {
        valid = val >= 50 && val <= 5000;
      } else if (rate === 'wk') {
        valid = val >= 200 && val <= 20000;
      } else if (rate === 'mo') {
        valid = val >= 1000 && val <= 100000;
      } else if (rate === 'session' || rate === 'visit') {
        valid = val >= 10 && val <= 2000;
      }

      if (valid) {
        return { min: Math.round(val), max: Math.round(val), raw: match[0].trim(), currency: detectedCurrency, rate };
      }
    }
  }

  return null;
}


// Detect if ATS returned 200 but content indicates listing is dead
function isDeadJobContent(html) {
  if (!html || html.length < 20) return false;
  var text = html.replace(/<[^>]+>/g, ' ').toLowerCase().trim();
  // Only flag if content is very short (error page, not a real JD)
  if (text.length > 500) return false;
  var deadPatterns = [
    'no longer accepting applications',
    'position has been filled',
    'this job is no longer available',
    'job not found',
    'page not found',
    'this position is no longer open',
    'this role has been filled',
    'sorry, this job has been closed',
    'this posting has expired'
  ];
  return deadPatterns.some(function(p) { return text.indexOf(p) >= 0; });
}

// ─── Dead Job Handler ───
// When ATS returns 404/410, the listing has been removed.
// Close in DB, remove from feed, update counts.
function handleDeadJob(jobId, bodyEl) {
  console.log('[BJ] Dead job detected:', jobId);
  
  // Update local cache
  const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
  if (cachedJob) {
    cachedJob.content = '<!-- unavailable -->';
    cachedJob.status = 'closed';
  }
  
  // Close in DB via edge function (status + content)
  enrichJob(jobId, { content: '<!-- unavailable -->', status: 'closed' });
  
  // Remove from feed DOM
  const feedRow = document.querySelector(`tr[data-jobid="${jobId}"]`);
  if (feedRow) {
    feedRow.style.transition = 'opacity 0.3s';
    feedRow.style.opacity = '0';
    setTimeout(() => {
      feedRow.remove();
      // Also remove snippet row if present
      const snippetRow = document.querySelector(`tr.job-snippet-row[data-jobid="${jobId}"]`);
      if (snippetRow) snippetRow.remove();
    }, 300);
  }
  
  // Remove from allJobs array so it doesn't reappear
  const idx = allJobs.findIndex(j => j.greenhouse_id === jobId);
  if (idx >= 0) allJobs.splice(idx, 1);
  
  // Also remove from currentJobs if present
  if (typeof currentJobs !== 'undefined') {
    const cidx = currentJobs.findIndex(j => j.greenhouse_id === jobId);
    if (cidx >= 0) currentJobs.splice(cidx, 1);
  }
  
  // Update feed count
  const totalEl = document.getElementById('j-total');
  if (totalEl) {
    const cur = parseInt(totalEl.textContent.replace(/,/g, '')) || 0;
    if (cur > 0) totalEl.textContent = (cur - 1).toLocaleString();
  }
  
  // Show message in modal
  if (bodyEl) {
    bodyEl.innerHTML = '<div style="text-align:center;padding:40px;">' +
      '<div style="margin-bottom:16px;">' +
        '<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<circle cx="24" cy="20" r="14" stroke="var(--text-faint)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>' +
          '<path d="M20 34h8M21 37h6M24 6v2M24 14a4 4 0 0 0-4 4c0 3 2 5 2 7h4c0-2 2-4 2-7a4 4 0 0 0-4-4z" stroke="var(--text-faint)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>' +
          '<line x1="10" y1="10" x2="38" y2="38" stroke="var(--warm)" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>' +
        '</svg>' +
      '</div>' +
      '<div style="color:var(--text);font-size:14px;font-weight:600;margin-bottom:6px;">This Brilliant opportunity has dimmed</div>' +
      '<div style="color:var(--text-faint);font-size:12px;line-height:1.6;max-width:320px;margin:0 auto;">' +
      'The listing is no longer live on the company\'s careers page. ' +
      'It\'s been removed from your feed and marked as closed.<br><br>' +
      '<span style="font-size:11px;opacity:0.7;">Don\'t worry — we\'re tracking 285,000+ jobs. Your next match is out there.</span></div></div>';
  }
}

async function fetchJobSpec(jobId, jobUrl, bodyEl) {
  try {
    // Try Greenhouse public JSON API — CORS-friendly, returns structured content
    // URL format: https://boards.greenhouse.io/{company}/jobs/{id}
    // API format: https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{id}
    const urlMatch = jobUrl.match(/boards\.greenhouse\.io\/([^\/]+)\/jobs\/(\d+)/);
    if (urlMatch) {
      const [, boardToken, jobNumId] = urlMatch;
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobNumId}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.content) {
          // Decode through helper that handles any encoding level
          const htmlContent = decodeJobContent(data.content);
          // Check if ATS returned a dead-listing page disguised as content
          if (isDeadJobContent(htmlContent)) {
            handleDeadJob(jobId, bodyEl);
            return;
          }
          bodyEl.innerHTML = htmlContent;
          // Also show department/location from API if available
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${meta.join('  ·  ')}</div>` + bodyEl.innerHTML;
          }
          // Cache the decoded version locally and in Supabase
          const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
          if (cachedJob) cachedJob.content = htmlContent;
          // Extract salary from content
          const salary = parseSalaryFromContent(htmlContent);
          const updateData = { content: htmlContent };
          if (salary) {
            updateData.salary_min = salary.min;
            updateData.salary_max = salary.max;
            updateData.salary_raw = salary.raw;
            updateData.salary_currency = salary.currency || 'USD'; updateData.salary_rate = salary.rate || 'yr';
            if (cachedJob) { cachedJob.salary_min = salary.min; cachedJob.salary_max = salary.max; cachedJob.salary_currency = salary.currency || 'USD'; cachedJob.salary_rate = salary.rate || 'yr'; }
            console.log(`[BJ] Salary extracted: ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k from "${salary.raw}"`);
            // Update salary cell in feed
            const salaryCell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
            if (salaryCell && cachedJob) salaryCell.textContent = formatSalaryCell(cachedJob);
          }
          enrichJob(jobId, { content: updateData.content, salary: updateData.salary_min ? { min: updateData.salary_min, max: updateData.salary_max, raw: updateData.salary_raw, currency: updateData.salary_currency, rate: updateData.salary_rate } : undefined });
          return;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        // Listing removed — close job and remove from feed
        handleDeadJob(jobId, bodyEl);
        return;
      }
    }
  } catch (err) {
    console.log('[BJ] Greenhouse API fetch failed:', err.message);
  }

  // Fallback: try using company slug from ats_companies + greenhouse_id
  // Handles self-hosted career pages (e.g. block.xyz/careers) that use Greenhouse backend
  try {
    const job = allJobs.find(j => j.greenhouse_id === jobId);
    const slug = job?.company_name;
    if (slug && jobId) {
      console.log(`[BJ] Trying slug fallback: ${slug}/jobs/${jobId}`);
      const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;
      const resp = await fetch(apiUrl);
      if (resp.ok) {
        const data = await resp.json();
        if (data.content) {
          const htmlContent = decodeJobContent(data.content);
          if (isDeadJobContent(htmlContent)) {
            handleDeadJob(jobId, bodyEl);
            return;
          }
          bodyEl.innerHTML = htmlContent;
          const meta = [];
          if (data.departments?.length) meta.push(data.departments.map(d => d.name).join(', '));
          if (data.offices?.length) meta.push(data.offices.map(o => o.name).join(', '));
          if (meta.length) {
            bodyEl.innerHTML = `<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border);">${meta.join('  ·  ')}</div>` + bodyEl.innerHTML;
          }
          const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
          if (cachedJob) cachedJob.content = htmlContent;
          const salary = parseSalaryFromContent(htmlContent);
          const updateData = { content: htmlContent };
          if (salary) {
            updateData.salary_min = salary.min;
            updateData.salary_max = salary.max;
            updateData.salary_raw = salary.raw;
            updateData.salary_currency = salary.currency || 'USD'; updateData.salary_rate = salary.rate || 'yr';
            if (cachedJob) { cachedJob.salary_min = salary.min; cachedJob.salary_max = salary.max; cachedJob.salary_currency = salary.currency || 'USD'; cachedJob.salary_rate = salary.rate || 'yr'; }
            console.log(`[BJ] Salary extracted (slug fallback): ${salary.currency || 'USD'} $${(salary.min/1000).toFixed(0)}k-$${(salary.max/1000).toFixed(0)}k`);
            const salaryCell = document.querySelector(`tr[data-jobid="${jobId}"] .jt-salary`);
            if (salaryCell && cachedJob) salaryCell.textContent = formatSalaryCell(cachedJob);
          }
          enrichJob(jobId, { content: updateData.content, salary: updateData.salary_min ? { min: updateData.salary_min, max: updateData.salary_max, raw: updateData.salary_raw, currency: updateData.salary_currency, rate: updateData.salary_rate } : undefined });
          return;
        }
      } else if (resp.status === 404 || resp.status === 410) {
        handleDeadJob(jobId, bodyEl);
        return;
      }
    }
  } catch (err) {
    console.log('[BJ] Slug fallback failed:', err.message);
  }

  // Try Edge Function proxy as backup
  try {
    const proxyUrl = SUPABASE_URL + '/functions/v1/fetch-job-spec';
    const resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPABASE_KEY },
      body: JSON.stringify({ url: jobUrl, greenhouse_id: jobId })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.content) {
        bodyEl.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(data.content, { USE_PROFILES: { html: true }, ADD_ATTR: ['target'] }) : data.content;
        const cachedJob = allJobs.find(j => j.greenhouse_id === jobId);
        if (cachedJob) cachedJob.content = data.content;
        return;
      }
    }
  } catch (err) {
    console.log('[BJ] Edge function fallback failed:', err.message);
  }

  // Final fallback
  bodyEl.innerHTML = `<div style="text-align:center;padding:40px;">
    <div style="color:var(--text-dim);margin-bottom:8px;font-size:14px;">Click below to view the full listing</div>
    <a href="${jobUrl}" target="_blank" rel="noopener" class="btn btn-primary" style="text-decoration:none;display:inline-block;margin-top:8px;">View on Company Site ↗</a>
  </div>`;
}

// Modal actions — sync back to feed
function modalApply(jobId, url) {
  window.open(url, '_blank');
  // Don't auto-mark as applied — the webRequest listener or manual confirmation will handle it
}

// Called when iframe detects a form submission (second load = confirmation page)
function markAppliedFromModal(jobId) {
  // Show resume picker first
  showResumePicker(jobId, function(resumeName) {
    // Update feed row
    const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
    if (row) {
      const actionCell = row.querySelector('td:last-child');
      if (actionCell) actionCell.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span>';
    }
    // Update state
    if (!appliedJobIds.includes(jobId)) {
      appliedJobIds.push(jobId);
      saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
    }
    // Store applied date
    const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
    dates[jobId] = new Date().toISOString();
    saveUserData('bj_applied_dates', JSON.stringify(dates));

    // Update pipeline meta
    const meta = getPipelineMeta();
    if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
    meta[jobId].stage = 'applied';
    if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
    if (resumeName) meta[jobId].resumeUsed = resumeName;
    const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
    const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
    meta[jobId].filterTags = checkedFilters;
    savePipelineMeta(meta);

    // Update modal UI
    const footerEl = $('#job-modal-footer');
    const bodyEl = $('#job-modal-body');
    
    bodyEl.innerHTML = `
      <div style="text-align:center;padding:60px 20px;">
        <div style="font-size:48px;margin-bottom:16px;">✓</div>
        <div style="font-size:16px;font-weight:600;color:var(--text);margin-bottom:8px;">Application Submitted</div>
        <div style="font-size:13px;color:var(--text-dim);">Tracked in your Pipeline under Applied</div>
        ${resumeName ? '<div style="font-size:12px;color:var(--purple);margin-top:8px;">Resume: ' + resumeName + '</div>' : ''}
      </div>`;
    
    footerEl.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span><button class="job-modal-close-btn" onclick="closeJobModal()" style="margin-left:auto;">Close</button>';
    
    // Refresh pipeline in background
    renderPipelineSaved();
    updateJobStats($('#j-total').textContent, $('#j-companies').textContent, $('#j-new-login').textContent, $('#j-new').textContent);
  });
}

function modalSave(jobId, btn) {
  const idx = savedJobIds.indexOf(jobId);
  const meta = getPipelineMeta();
  if (idx >= 0) {
    savedJobIds.splice(idx, 1);
    btn.className = 'job-action-btn';
    btn.textContent = 'Add to Pipeline';
    delete meta[jobId];
  } else {
    savedJobIds.push(jobId);
    btn.className = 'job-action-btn saved-btn';
    btn.textContent = 'In Pipeline';
    if (!meta[jobId]) meta[jobId] = { stage: 'saved', savedAt: new Date().toISOString(), filterTags: [] };
  }
  savePipelineMeta(meta);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
  // Sync feed row
  const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
  if (row) {
    const saveBtn = row.querySelector('.job-action-btn:not(.hide-btn):not(.applied-btn)');
    if (saveBtn && !saveBtn.classList.contains('apply-btn-default')) {
      if (savedJobIds.includes(jobId)) {
        saveBtn.className = 'job-action-btn saved-btn';
        saveBtn.textContent = 'Pipeline ✓';
      } else {
        saveBtn.className = 'job-action-btn';
        saveBtn.textContent = 'Pipeline';
      }
    }
  }
  updateJobStats($('#j-total').textContent, $('#j-companies').textContent, $('#j-new-login').textContent, $('#j-new').textContent);
}

function modalHide(jobId) {
  // Get job info from current results
  const job = currentJobs.find(j => j.greenhouse_id === jobId) || {};
  showHideReasonPopup(jobId, job.title || '', job.company_name || '', null, () => {
    const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
    if (row) row.style.display = 'none';
    closeJobModal();
  }, job.url || '', job.company_slug || '');
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Close hide reason popup first if open
    const popup = document.querySelector('.hide-reason-popup');
    if (popup) { popup.remove(); return; }
    if ($('#job-modal-overlay')?.style?.display === 'flex') {
      closeJobModal();
    }
  }
});

// Close hide popup on outside click
document.addEventListener('click', e => {
  const popup = document.querySelector('.hide-reason-popup');
  if (popup && !popup.contains(e.target) && !e.target.classList.contains('hide-btn') && !e.target.classList.contains('hide-job-btn')) {
    popup.remove();
  }
});

function showHideReasonPopup(jobId, title, company, anchorEl, afterHide, jobUrl, companySlug, filterIdxs) {
  // Remove any existing popup
  document.querySelectorAll('.hide-reason-popup').forEach(p => p.remove());

  const popup = document.createElement('div');
  popup.className = 'hide-reason-popup';
  popup.innerHTML = `<h4>Why hide this?</h4>` +
    HIDE_REASONS.map(r =>
      `<button class="hide-reason-btn" data-reason="${r.key}">${r.label}</button>`
    ).join('');

  // Position near the button or center of screen
  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.left = Math.min(rect.left, window.innerWidth - 240) + 'px';
  } else {
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
  }

  popup.querySelectorAll('.hide-reason-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reason = btn.dataset.reason;
      hiddenJobIds.push({
        id: jobId,
        reason,
        title: title || '',
        company: company || '',
        url: jobUrl || '',
        companySlug: companySlug || '',
        hiddenAt: new Date().toISOString(),
        filterIdxs: filterIdxs || []
      });
      saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
      popup.remove();
      if (afterHide) afterHide();
      bjUpdateImproveButton();
    });
  });

  document.body.appendChild(popup);
}

function hideJob(jobId, btn) {
  const row = btn.closest('tr');
  const job = currentJobs.find(j => j.greenhouse_id === jobId) || {};
  // Track which filter(s) were active when this job was hidden
  var activeFilterIdxs = [];
  if (typeof savedFilters !== 'undefined') {
    var sel = JSON.parse(localStorage.getItem('bj_sf_selected') || '[]');
    if (sel.length > 0) activeFilterIdxs = sel.map(Number).filter(function(n) { return !isNaN(n) && n >= 0; });
  }
  showHideReasonPopup(jobId, job.title || '', job.company_name || '', btn, () => {
    if (row) row.style.display = 'none';
  }, job.url || '', job.company_slug || '', activeFilterIdxs);
}

function toggleSaveJob(jobId, btn) {
  const idx = savedJobIds.indexOf(jobId);
  const meta = getPipelineMeta();
  if (idx >= 0) {
    savedJobIds.splice(idx, 1);
    btn.textContent = 'Pipeline';
    btn.classList.remove('saved-btn');
    delete meta[jobId];
  } else {
    savedJobIds.push(jobId);
    btn.textContent = 'Pipeline ✓';
    btn.classList.add('saved-btn');
    if (!meta[jobId]) meta[jobId] = { stage: 'saved', savedAt: new Date().toISOString(), filterTags: [] };
  }
  savePipelineMeta(meta);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
}


// ════════════════════════════════════════════════════════════
// IMPROVE FILTERS FROM HIDDEN JOBS (E18 — frontend wiring)
// ════════════════════════════════════════════════════════════

// Show/hide the Improve Filters button based on hidden job count
function bjUpdateImproveButton() {
  var btn = document.getElementById('improve-filters-btn');
  if (!btn) return;
  var count = (typeof hiddenJobIds !== 'undefined' ? hiddenJobIds : []).length;
  if (count >= 3) {
    btn.style.display = '';
    btn.textContent = '\ud83d\udd27 Improve Filters (' + count + ' hidden)';
  } else {
    btn.style.display = 'none';
  }
}

// Call on page load and after every hide
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(bjUpdateImproveButton, 500);
});

// Main handler — batch analyze recent hidden jobs
async function bjImproveFiltersFromHidden() {
  var btn = document.getElementById('improve-filters-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyzing\u2026'; btn.style.opacity = '0.7'; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { alert('Please sign in to use AI features.'); return; }

    // Get resume text (most recent non-archived)
    var resumesWithText = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
      return r.extractedText && r.extractedText.length > 100 && !r.archived;
    });
    if (resumesWithText.length === 0) {
      alert('Upload a resume first (Resumes tab) for AI to compare against.');
      if (btn) { btn.disabled = false; bjUpdateImproveButton(); }
      return;
    }
    var resume = resumesWithText[resumesWithText.length - 1];

    // Get recent hidden jobs (last 10)
    var recent = hiddenJobIds.slice(-10);
    if (recent.length === 0) { return; }

    // Get current filter pills for context
    var filterPills = null;
    if (typeof savedFilters !== 'undefined' && savedFilters.length > 0) {
      filterPills = savedFilters[0]; // use first saved filter as context
    }

    // Batch analyze — call for each hidden job in parallel (up to 5 concurrent)
    var allSuggestions = { what_not: [], where_not: [], who_not: [] };
    var batch = recent.slice(0, 5);

    var promises = batch.map(function(hj) {
      return fetch(SUPABASE_URL + '/functions/v1/analyze-hidden-job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.data.session.access_token,
          'apikey': SUPABASE_KEY
        },
        body: JSON.stringify({
          job_id: hj.id,
          resume_text: resume.extractedText.slice(0, 6000),
          filter_pills: filterPills
        })
      }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
    });

    var results = await Promise.all(promises);

    // Aggregate and deduplicate suggestions
    var seenWhat = new Set();
    var seenWhere = new Set();
    var seenWho = new Set();

    results.forEach(function(r) {
      if (!r) return;
      (r.what_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWhat.has(key)) { seenWhat.add(key); allSuggestions.what_not.push(s); }
      });
      (r.where_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWhere.has(key)) { seenWhere.add(key); allSuggestions.where_not.push(s); }
      });
      (r.who_not || []).forEach(function(s) {
        var key = s.term.toLowerCase();
        if (!seenWho.has(key)) { seenWho.add(key); allSuggestions.who_not.push(s); }
      });
    });

    var totalSuggestions = allSuggestions.what_not.length + allSuggestions.where_not.length + allSuggestions.who_not.length;

    if (totalSuggestions === 0) {
      if (btn) { btn.disabled = false; btn.textContent = 'No suggestions found'; setTimeout(bjUpdateImproveButton, 2000); }
      return;
    }

    // Show results in a modal
    bjShowImproveSuggestions(allSuggestions, batch.length);

    if (btn) { btn.disabled = false; bjUpdateImproveButton(); }

  } catch (e) {
    console.error('[BJ] Improve filters error:', e);
    if (btn) { btn.disabled = false; bjUpdateImproveButton(); }
  }
}

function bjShowImproveSuggestions(suggestions, jobsAnalyzed) {
  // Remove any existing modal
  var existing = document.getElementById('improve-suggestions-modal');
  if (existing) existing.remove();

  var total = suggestions.what_not.length + suggestions.where_not.length + suggestions.who_not.length;

  var html = '<div id="improve-suggestions-modal" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">';
  html += '<div style="background:var(--bg-card);border-radius:12px;max-width:500px;width:90%;max-height:80vh;overflow-y:auto;padding:24px;">';

  html += '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:4px;">\ud83d\udd27 Filter Improvement Suggestions</div>';
  html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">Based on analysis of ' + jobsAnalyzed + ' hidden jobs \u00b7 ' + total + ' suggestions</div>';

  // What NOT
  if (suggestions.what_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--red);margin-bottom:6px;">WHAT NOT \u2014 Title exclusions</div>';
    suggestions.what_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="what_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:var(--red);cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Where NOT
  if (suggestions.where_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--warm);margin-bottom:6px;">WHERE NOT \u2014 Location exclusions</div>';
    suggestions.where_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="where_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:var(--warm);cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Who NOT
  if (suggestions.who_not.length > 0) {
    html += '<div style="margin-bottom:12px;">';
    html += '<div style="font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:6px;">WHO NOT \u2014 Company exclusions</div>';
    suggestions.who_not.forEach(function(s) {
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(124,58,237,0.05);border:1px solid rgba(124,58,237,0.15);border-radius:6px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-type="who_not" data-term="' + s.term.replace(/"/g, '&quot;') + '" style="accent-color:#7c3aed;cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + s.term + '</div>';
      html += '<div style="font-size:10px;color:var(--text-faint);">' + s.reason + '</div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  html += '<div style="display:flex;gap:8px;margin-top:16px;">';
  html += '<button onclick="bjApplyImproveSuggestions()" style="flex:1;padding:10px;background:var(--green);color:#fff;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer;">Apply Selected</button>';
  html += '<button onclick="document.getElementById(\'improve-suggestions-modal\').remove()" style="padding:10px 16px;background:var(--bg-main);color:var(--text-faint);border:1px solid var(--border);border-radius:6px;font-size:12px;cursor:pointer;">Cancel</button>';
  html += '</div>';

  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}

function bjApplyImproveSuggestions() {
  var modal = document.getElementById('improve-suggestions-modal');
  if (!modal) return;

  var checkboxes = modal.querySelectorAll('input[type=checkbox]:checked');
  if (checkboxes.length === 0) { modal.remove(); return; }

  // Collect selected suggestions
  var whatNot = [];
  var whereNot = [];
  var whoNot = [];

  checkboxes.forEach(function(cb) {
    var type = cb.dataset.type;
    var term = cb.dataset.term;
    if (type === 'what_not') whatNot.push(term);
    if (type === 'where_not') whereNot.push(term);
    if (type === 'who_not') whoNot.push(term);
  });

  // Apply to the first saved filter's tuning config
  // This integrates with the existing Search Tuning system
  if (typeof savedFilters !== 'undefined' && savedFilters.length > 0) {
    var filter = savedFilters[0];

    // Add to title exclusions
    if (whatNot.length > 0) {
      if (!filter.titleExclusions) filter.titleExclusions = [];
      whatNot.forEach(function(term) {
        if (!filter.titleExclusions.includes(term)) filter.titleExclusions.push(term);
      });
    }

    // Add to location exclusions
    if (whereNot.length > 0) {
      if (!filter.locationExclusions) filter.locationExclusions = [];
      whereNot.forEach(function(term) {
        if (!filter.locationExclusions.includes(term)) filter.locationExclusions.push(term);
      });
    }

    // Add to company exclusions
    if (whoNot.length > 0) {
      if (!filter.companyExclusions) filter.companyExclusions = [];
      whoNot.forEach(function(term) {
        if (!filter.companyExclusions.includes(term)) filter.companyExclusions.push(term);
      });
    }

    saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
    console.log('[BJ] Applied NOT suggestions:', { whatNot, whereNot, whoNot });
  }

  modal.remove();

  // Show confirmation and refresh feed
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--green);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:10000;';
  toast.textContent = '\u2713 ' + checkboxes.length + ' exclusion(s) applied to your filter';
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 3000);

  // Refresh the feed with new exclusions
  if (typeof refreshFeed === 'function') refreshFeed();
}

// ════════════════════════════════════════════════════════════
// G23: AUTO-ADD REWRITE TO RESUME LIBRARY
// G26: TIER PROVENANCE TRACKING
// ════════════════════════════════════════════════════════════

function bjAddRewriteToLibrary(ri, fi, data, filterName) {
  var original = resumes[ri];
  if (!original) return;

  var round = 1;
  resumes.forEach(function(r) {
    if (r.source === 'rewrite' && r.basedOn === original.id) {
      round = Math.max(round, (r.rewrite_round || 0) + 1);
    }
  });

  var id = 'res_rw_' + data.session_id.slice(0, 8) + '_' + round;
  var name = (original.name || 'Resume') + ' \u2014 ' + (filterName || 'Rewrite') + ' v' + round;

  var newResume = {
    id: id,
    name: name,
    fileName: name + '.docx',
    size: '',
    filterIds: filterName ? [filterName] : (original.filterIds || []).slice(),
    uploadedAt: new Date().toLocaleDateString(),
    levelLabel: original.levelLabel || '',
    levelColor: original.levelColor || '',
    archived: false,
    extractedText: '',
    keywords: original.keywords || [],
    textStatus: 'ready',
    source: 'rewrite',
    basedOn: original.id,
    rewrite_session_id: data.session_id,
    rewrite_round: round,
    analysis_tier: 'premium',
    rewrite_tier: 'premium',
    tier_history: [
      { action: 'analyzed', tier: 'premium', timestamp: new Date().toISOString() },
      { action: 'rewritten', tier: 'premium', round: round, timestamp: new Date().toISOString() }
    ],
    resume_path: data.resume_path,
    qa_clean: data.qa_report ? (data.qa_report.accuracy?.clean && data.qa_report.bleed?.clean) : null,
    changes_count: (data.changes_made || []).length,
    template_used: data.template_used
  };

  // Extract text from resume sections for keyword analysis
  if (data.resume_sections) {
    var textParts = [];
    (data.resume_sections || []).forEach(function(section) {
      (section.items || []).forEach(function(item) {
        if (item.content) {
          if (item.content.text) textParts.push(item.content.text);
          if (item.content.title) textParts.push(item.content.title);
          if (item.content.company) textParts.push(item.content.company);
          if (item.content.bullets) textParts.push(item.content.bullets.join(' '));
          if (item.content.skills) textParts.push(item.content.skills.join(', '));
          if (item.content.degree) textParts.push(item.content.degree);
        }
      });
    });
    newResume.extractedText = textParts.join('\n');
    if (typeof extractResumeKeywords === 'function') {
      newResume.keywords = extractResumeKeywords(newResume.extractedText);
    }
  }

  resumes.push(newResume);
  saveResumes();
  if (typeof renderResumes === 'function') renderResumes();
  console.log('[BJ] Rewrite added to library:', id, name);
  return id;
}

// ════════════════════════════════════════════════════════════
// G24-G25: COVER LETTER SAVE + ARCHIVE
// ════════════════════════════════════════════════════════════

async function bjSaveCoverLetter(data, filterName) {
  if (!data.cover_letter || !data.cover_letter_path) return;
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;
    var { error } = await sb.from('cover_letters').insert({
      user_id: session.data.session.user.id,
      session_id: data.session_id,
      round_number: 1,
      filter_name: filterName || '',
      paragraphs: data.cover_letter.paragraphs || [],
      salutation: data.cover_letter.salutation || '',
      closing: data.cover_letter.closing || '',
      word_count: data.cover_letter.word_count || 0,
      storage_path: data.cover_letter_path,
      tier: 'premium',
      analysis_tier: 'premium'
    });
    if (error) console.error('[BJ] Cover letter save error:', error);
    else console.log('[BJ] Cover letter saved');
  } catch (e) { console.error('[BJ] Cover letter save exception:', e); }
}

async function bjRenderCoverLetterArchive() {
  var container = document.getElementById('cover-letter-archive');
  if (!container) return;
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { container.style.display = 'none'; return; }
    var { data: covers, error } = await sb.from('cover_letters')
      .select('*').eq('user_id', session.data.session.user.id)
      .order('created_at', { ascending: false }).limit(20);
    if (error || !covers || covers.length === 0) { container.style.display = 'none'; return; }

    container.style.display = '';
    var html = '<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:8px;">Cover Letters (' + covers.length + ')</div>';
    covers.forEach(function(cl) {
      var date = cl.created_at ? new Date(cl.created_at).toLocaleDateString() : '';
      var tierBadge = cl.tier === 'premium'
        ? '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:linear-gradient(135deg,rgba(77,142,255,0.1),rgba(124,58,237,0.1));border:1px solid rgba(77,142,255,0.2);color:#4d8eff;font-weight:600;">\u2728 Premium</span>'
        : '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(148,163,184,0.1);color:#94a3b8;font-weight:600;">AI Basic</span>';
      var downloadUrl = SUPABASE_URL + '/storage/v1/object/public/' + cl.storage_path;
      html += '<div style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;background:var(--bg-input);">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap;">';
      html += '<span style="font-size:12px;font-weight:600;color:var(--text);">\ud83d\udcc4 ' + (cl.filter_name || 'General') + '</span>' + tierBadge;
      html += '<span style="font-size:10px;color:var(--text-faint);margin-left:auto;">' + date + ' \u00b7 ' + (cl.word_count || '?') + ' words</span></div>';
      html += '<div id="cl-preview-' + cl.id + '" style="display:none;font-size:11px;color:var(--text-dim);margin:6px 0;padding:8px;background:var(--bg-main);border-radius:4px;line-height:1.5;">';
      html += '<div style="font-style:italic;margin-bottom:4px;">' + (cl.salutation || '') + '</div>';
      (cl.paragraphs || []).forEach(function(p) { html += '<div style="margin-bottom:6px;">' + p + '</div>'; });
      html += '<div>' + (cl.closing || '') + '</div></div>';
      html += '<div style="display:flex;gap:6px;">';
      html += '<button class="btn btn-sm" onclick="var e=document.getElementById(\'cl-preview-' + cl.id + '\');e.style.display=e.style.display===\'none\'?\'\':\'none\';" style="font-size:9px;padding:2px 8px;">Preview</button>';
      html += '<a href="' + downloadUrl + '" download class="btn btn-sm" style="font-size:9px;padding:2px 8px;text-decoration:none;">Download</a>';
      html += '<button class="btn btn-sm" onclick="bjDeleteCoverLetter(\'' + cl.id + '\')" style="font-size:9px;padding:2px 8px;color:var(--red);">Delete</button>';
      html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) { console.error('[BJ] Cover letter archive error:', e); container.style.display = 'none'; }
}

async function bjDeleteCoverLetter(id) {
  if (!confirm('Delete this cover letter?')) return;
  try { await sb.from('cover_letters').delete().eq('id', id); bjRenderCoverLetterArchive(); }
  catch (e) { console.error('[BJ] Delete cover letter error:', e); }
}


// === js/browsers.js ===
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



// === js/location.js ===
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
    } catch (e) {}
  }
  // Fetch static JSON
  try {
    var res = await fetch('/data/ref_city_radius.json');
    if (res.ok) {
      _refCityCache = await res.json();
      localStorage.setItem('bj_ref_city_radius', JSON.stringify({ data: _refCityCache, ts: Date.now() }));
      return _refCityCache;
    }
  } catch (e) { console.warn('[Location] Failed to load ref_city_radius.json:', e); }
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
  } catch (e) {
    console.warn('[BJ] Location search failed:', e);
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
  } catch (e) {
    console.warn('[BJ] NOT location search failed:', e);
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
  } catch (e) { console.warn('[BJ] ATS company search (not) failed:', e); }

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
  } catch (e) { console.warn('[BJ] Connection company search (not) failed:', e); }

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
const collapseStates = JSON.parse(localStorage.getItem('bj_collapse') || '{}');
if (collapseStates.qb) {
  $('#qb-toggle').classList.add('collapsed');
  $('#qb-collapse-body').classList.add('collapsed');
}
if (collapseStates.sf) {
  $('#sf-toggle').classList.add('collapsed');
  $('#sf-collapse-body').classList.add('collapsed');
}

function saveCollapseStates() {
  const states = JSON.parse(localStorage.getItem('bj_collapse') || '{}');
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
  whatPills = [];
  wherePills = [];
  whenPills = [];
  whoPills = [];
  payPills = [];
  whatNotPills = [];
  whereNotPills = [];
  whoNotPills = [];
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
  const tuningCheck = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
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
    includeNoSalary: $('#save-filter-include-no-salary').checked,
    includeRemote: $('#save-filter-include-remote').checked,
    createdAt: Date.now(),
    lastUsed: Date.now(),
    useCount: 1
  };
  // Preserve existing per-filter level hierarchy if updating, otherwise inherit global default
  const existingIdx = savedFilters.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
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
  // Only clear the name if it was a new filter
  if (existingIdx < 0) {
    $('#save-filter-name').value = '';
  }
  window._editingFilterIdx = null;
  renderSavedFilters();
  // Re-run search with updated filters
  debouncedSearchJobs();
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
    if ($('#qb-input-pay-min').value && !$('#qb-input-pay-max').value) {
      // Min only — focus max to let user set a range, or press Enter again to apply as min+
      $('#qb-input-pay-max').focus();
    } else if ($('#qb-input-pay-min').value || $('#qb-input-pay-max').value) {
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
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  // Sort by last used (most recent first)
  const sorted = [...savedFilters]
    .map((sf, i) => ({ ...sf, _idx: i }))
    .filter(sf => !query || sf.name.toLowerCase().includes(query))
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
      <div class="sf-item-counts">
        <span class="sf-count" style="font-size:9px;font-weight:700;color:var(--text-faint);">1D</span>
        <span class="sf-count" style="font-size:9px;font-weight:700;color:var(--text-faint);">7D</span>
        <span class="sf-count" style="font-size:9px;font-weight:700;color:var(--text-faint);">30D</span>
      </div>
      <div style="width:48px;"></div>
    </div>
  </div>` + sorted.map(sf => {
    const ago = sf.createdAt ? timeAgo(sf.createdAt) : '';
    const meta = ago ? `created ${ago}` : '';
    const jToday = sf.jobsToday || '—';
    const jWeek = sf.jobsWeek || '—';
    const jMonth = sf.jobsMonth || '—';

    // Build mini pill HTML from saved filter criteria
    let miniPills = '';
    const allSfPills = [
      ...(sf.whatPills || sf.pills || []).map(p => ({ ...p, row: 'what' })),
      ...(sf.wherePills || []).map(p => ({ ...p, row: 'where' })),
      ...(sf.whenPills || []).map(p => ({ ...p, row: 'when' })),
      ...(sf.whoPills || []).map(p => ({ ...p, row: 'who' })),
      ...(sf.payPills || []).map(p => ({ ...p, row: 'pay' })),
      ...(sf.whatNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'what' })),
      ...(sf.whereNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'where' })),
      ...(sf.whoNotPills || []).map(p => ({ ...p, row: 'not', notSource: 'who' })),
    ];
    // Show "incl. no salary" pill when pay filter exists and includeNoSalary is on
    if ((sf.payPills || []).length > 0 && sf.includeNoSalary !== false) {
      allSfPills.push({ values: ['incl. no salary'], row: 'pay', _isNoSalary: true });
    }
    // Show "incl. remote" pill when location filter exists and includeRemote is on
    const hasLocPills = (sf.wherePills || []).length > 0;
    const hasExplicitRemotePill = (sf.wherePills || []).some(p => p.locType === 'remote' || (p.values && p.values[0]?.toLowerCase() === 'remote'));
    if (hasLocPills && !hasExplicitRemotePill && sf.includeRemote === true) {
      allSfPills.push({ values: ['incl. remote'], row: 'where', _isRemoteToggle: true });
    }
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
        <div class="sf-item-name">${sf.name}</div>
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
        <div class="sf-item-counts">
          <span class="sf-count sf-count-today">${jToday}</span>
          <span class="sf-count sf-count-week">${jWeek}</span>
          <span class="sf-count sf-count-month">${jMonth}</span>
        </div>
        <span class="sf-dup" data-dupidx="${sf._idx}" title="Duplicate filter" style="font-size:11px;color:var(--text-faint);cursor:pointer;padding:2px 4px;opacity:0;transition:opacity 0.1s;">⧉</span>
        <span class="sf-levels-btn" data-idx="${sf._idx}" title="${sf.assignedLevels?.length ? sf.assignedLevels.length + ' levels assigned — click to edit' : sf.levelHierarchy ? 'Custom levels — click to edit' : 'Assign levels to this filter'}" style="font-size:10px;color:${sf.assignedLevels?.length ? 'var(--green)' : sf.levelHierarchy ? 'var(--accent)' : 'var(--text-faint)'};cursor:pointer;padding:2px 4px;opacity:${sf.assignedLevels?.length || sf.levelHierarchy ? '0.8' : '0'};transition:opacity 0.1s;">⚙</span>
      </div>
    </div>`;
  }).join('');

  // Bind load (skip if clicking checkbox)
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
  const checkedState = JSON.parse(localStorage.getItem('bj_sf_checked') || '{}');
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
      const tuningLoc = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
      let locIds = null;
      if (wh.length > 0 || whnot.length > 0 || tuningLoc.usOnly) {
        locIds = await getLocationMatchIds(wh, whnot, tuningLoc, sf.includeRemote === true);
      }

      // Today (last 24h)
      let q1 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q1 = buildFilterQuery(sf, q1, locIds);
      q1 = q1.gte('updated_at', last24h.toISOString());
      const r1 = await q1;
      const c1 = r1.error ? 0 : (r1.count || 0);

      // 7 days
      let q2 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q2 = buildFilterQuery(sf, q2, locIds);
      q2 = q2.gte('updated_at', weekAgo.toISOString());
      const r2 = await q2;
      const c2 = r2.error ? 0 : (r2.count || 0);

      // 30 days
      let q3 = sb.from('ats_jobs').select('greenhouse_id', { count: 'exact', head: true });
      q3 = buildFilterQuery(sf, q3, locIds);
      q3 = q3.gte('updated_at', monthAgo.toISOString());
      const r3 = await q3;
      const c3 = r3.error ? 0 : (r3.count || 0);

      console.log(`Filter "${sf.name}": today=${c1}, 7d=${c2}, 30d=${c3}`);

      // Update the DOM — find by data-idx which matches original array index
      const rows = $$('.sf-item');
      rows.forEach(row => {
        if (parseInt(row.dataset.idx) === i) {
          const counts = row.querySelectorAll('.sf-count');
          if (counts[0]) counts[0].textContent = c1.toLocaleString();
          if (counts[1]) counts[1].textContent = c2.toLocaleString();
          if (counts[2]) counts[2].textContent = c3.toLocaleString();
        }
      });

      // Persist
      savedFilters[i].jobsToday = c1;
      savedFilters[i].jobsWeek = c2;
      savedFilters[i].jobsMonth = c3;
    } catch (e) {
      console.error(`Count error for filter ${i} "${sf.name}":`, e);
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
  // Check if user has any resumes with extracted text
  var resumesWithText = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return r.extractedText && r.extractedText.length > 100 && !r.archived;
  });
  
  if (resumesWithText.length === 0) {
    alert('Upload a resume first (Resumes tab), then come back to generate a filter.');
    return;
  }
  
  // Show modal
  var modal = document.getElementById('ai-filter-modal');
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var meta = document.getElementById('ai-filter-meta');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  footer.style.display = 'none';

  // Build resume picker with upload option
  var pickerHtml = '<div style="padding:16px;">';
  
  if (resumesWithText.length > 0) {
    meta.textContent = 'Choose a resume to analyze';
    pickerHtml += '<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">Select a resume for AI to analyze and generate job filters:</div>';
    resumesWithText.forEach(function(r, idx) {
      pickerHtml += '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.1s;display:flex;align-items:center;gap:10px;" ' +
        'onmouseenter="this.style.borderColor=\'var(--accent)\';this.style.background=\'var(--accent-glow)\'" ' +
        'onmouseleave="this.style.borderColor=\'var(--border)\';this.style.background=\'none\'" ' +
        'onclick="window._aiResumeChoice=' + idx + ';_doAiFilterAnalysis();">' +
        '<div style="width:32px;height:32px;border-radius:6px;background:hsla(var(--accent-hsl),0.1);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;">' + (r.name.match(/\.pdf$/i) ? 'PDF' : 'DOC') + '</div>' +
        '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (r.name || 'Resume') + '</div>' +
        '<div style="font-size:10px;color:var(--text-faint);">' + (r.size || '') + (r.uploadedAt ? ' · ' + r.uploadedAt : '') + '</div></div>' +
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
  if (resumesWithText.length === 1) {
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
    console.error('[AI Filter Upload]', err);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Upload failed: ' + err.message + '</div>';
  }
}

function continueAiFilterSuggest() {
  _doAiFilterAnalysis();
}

async function _doAiFilterAnalysis() {
  var resumesWithText = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return r.extractedText && r.extractedText.length > 100 && !r.archived;
  });
  var idx = window._aiResumeChoice || 0;
  var resume = resumesWithText[idx];
  if (!resume) return;
  
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
    try { session = (await sb.auth.getSession()).data.session; } catch(e) {}
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


// === js/pipeline.js ===
// ============================================================
// PIPELINE — Table-based stage tracker (redesigned)
// ============================================================
const PL_STAGES = ['saved','applied','posting_closed','responded','interview','offer','rejected'];
const PL_STAGE_COLORS = {
  saved: 'var(--text-dim)', applied: 'var(--accent)', posting_closed: 'var(--warm)',
  responded: 'var(--green)', interview: 'var(--purple)', offer: 'var(--green)', rejected: 'var(--red)'
};

// Pipeline metadata per job — stage, dates, resume
function getPipelineMeta() {
  return JSON.parse(localStorage.getItem('bj_pipeline_meta') || '{}');
}
function savePipelineMeta(meta) {
  saveUserData('bj_pipeline_meta', JSON.stringify(meta));
}

// Migrate from old system on first load
function migratePipelineData() {
  const meta = getPipelineMeta();
  if (Object.keys(meta).length > 0) return; // Already migrated
  const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
  // Migrate applied jobs
  appliedJobIds.forEach(id => {
    meta[id] = {
      stage: 'applied',
      savedAt: dates[id] || new Date().toISOString(),
      appliedAt: dates[id] || new Date().toISOString(),
      resumeUsed: '',
      filterTags: []
    };
  });
  // Migrate saved-only jobs
  savedJobIds.filter(id => !appliedJobIds.includes(id)).forEach(id => {
    meta[id] = {
      stage: 'saved',
      savedAt: new Date().toISOString(),
      resumeUsed: '',
      filterTags: []
    };
  });
  savePipelineMeta(meta);
  console.log('[BJ] Pipeline data migrated:', Object.keys(meta).length, 'jobs');
}

// Move job to a new stage
function movePipelineStage(jobId, newStage) {
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = newStage;
  // Track stage dates
  if (newStage === 'applied' && !meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  if (newStage === 'responded' && !meta[jobId].respondedAt) meta[jobId].respondedAt = new Date().toISOString();
  if (newStage === 'interview' && !meta[jobId].interviewAt) meta[jobId].interviewAt = new Date().toISOString();
  if (newStage === 'offer' && !meta[jobId].offerAt) meta[jobId].offerAt = new Date().toISOString();
  if (newStage === 'rejected' && !meta[jobId].rejectedAt) meta[jobId].rejectedAt = new Date().toISOString();
  savePipelineMeta(meta);
  // Keep legacy arrays in sync
  if (newStage !== 'saved' && !appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
    saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
  }
  renderPipeline();
}

// Mark applied from feed
function markApplied(jobId, btn) {
  // Show resume picker, then complete
  showResumePicker(jobId, function(resumeName) {
    _completeMarkApplied(jobId, btn, resumeName);
  });
}

function _completeMarkApplied(jobId, btn, resumeName) {
  if (!appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
    saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
    if (btn) {
      const row = btn.closest('tr');
      if (row) {
        const actionsCell = row.querySelector('td:last-child');
        if (actionsCell) {
          const hideBtn = actionsCell.querySelector('.hide-btn');
          const hideBtnHtml = hideBtn ? hideBtn.outerHTML : '';
          actionsCell.innerHTML = '<span class="job-action-btn applied-btn">Applied \u2713</span>' + hideBtnHtml;
        }
      }
    }
  }
  // Update pipeline meta
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = 'applied';
  if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  // Store resume
  if (resumeName) {
    meta[jobId].resumeUsed = resumeName;
  }
  // Detect filter tags
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  meta[jobId].filterTags = checkedFilters;
  savePipelineMeta(meta);
  // Store applied date for legacy compat
  const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
  dates[jobId] = new Date().toISOString();
  saveUserData('bj_applied_dates', JSON.stringify(dates));
}

function markAppliedFromPipeline(jobId, btn) {
  markApplied(jobId, btn);
  renderPipeline();
}

function unsaveFromPipeline(jobId) {
  const meta = getPipelineMeta();
  delete meta[jobId];
  savePipelineMeta(meta);
  const idx = savedJobIds.indexOf(jobId);
  if (idx >= 0) savedJobIds.splice(idx, 1);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
  const aidx = appliedJobIds.indexOf(jobId);
  if (aidx >= 0) appliedJobIds.splice(aidx, 1);
  saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
  renderPipeline();
}

// Collapse toggle
function togglePipelineStage(headerEl) {
  const section = headerEl.closest('.pl-stage-section');
  section.classList.toggle('collapsed');
  // Persist collapse state
  const states = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');
  states[section.dataset.stage] = section.classList.contains('collapsed');
  localStorage.setItem('bj_pl_collapse', JSON.stringify(states));
}

// Filter by saved filter tag
let _plActiveFilter = 'all';
function filterPipeline(tag) {
  _plActiveFilter = tag;
  renderPipeline();
}

// Build filter dropdown options
function buildPipelineFilterTags() {
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const select = $('#pl-filter-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Filters</option>';
  sf.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  select.value = currentVal || 'all';
}

// Main render
async function renderPipeline() {
  const meta = getPipelineMeta();
  const allIds = Object.keys(meta);
  if (allIds.length === 0) {
    PL_STAGES.forEach(stage => {
      const body = document.getElementById('pb-' + stage);
      if (body) body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      const count = document.getElementById('pc-' + stage);
      if (count) count.textContent = '0';
    });
    return;
  }

  // Fetch all pipeline jobs from Supabase
  const batchSize = 100;
  let allJobData = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    try {
      const { data } = await sb.from('ats_jobs')
        .select('greenhouse_id, title, company_name, location, loc_display, status, closed_at, first_seen_at, content, salary_min, salary_max')
        .in('greenhouse_id', batch);
      if (data) allJobData = allJobData.concat(data);
    } catch (e) { console.error('[BJ] Pipeline fetch error:', e); }
  }

  const jobMap = {};
  allJobData.forEach(j => { jobMap[j.greenhouse_id] = j; });

  // Auto-detect posting_closed
  allJobData.forEach(j => {
    if (j.status === 'closed' && meta[j.greenhouse_id] && meta[j.greenhouse_id].stage === 'applied') {
      meta[j.greenhouse_id].stage = 'posting_closed';
    }
  });
  savePipelineMeta(meta);

  const now = new Date();
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  // Restore collapse states
  const collapseStates = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');

  // Group by stage
  const stageJobs = {};
  PL_STAGES.forEach(s => { stageJobs[s] = []; });
  let totalTracked = 0, activeCount = 0, respondedCount = 0, totalDaysToResponse = 0;

  for (const [jobId, m] of Object.entries(meta)) {
    const stage = m.stage || 'saved';
    if (!stageJobs[stage]) continue;
    // Apply filter
    if (_plActiveFilter !== 'all' && !(m.filterTags || []).includes(_plActiveFilter)) continue;
    const job = jobMap[jobId];
    stageJobs[stage].push({ id: jobId, meta: m, job: job || null });
    totalTracked++;
    if (['applied','responded','interview'].includes(stage)) activeCount++;
    if (m.respondedAt && m.appliedAt) {
      respondedCount++;
      totalDaysToResponse += Math.floor((new Date(m.respondedAt) - new Date(m.appliedAt)) / 86400000);
    }
  }

  // Render each stage
  for (const stage of PL_STAGES) {
    const jobs = stageJobs[stage];
    const body = document.getElementById('pb-' + stage);
    const countEl = document.getElementById('pc-' + stage);
    const matchEl = document.getElementById('pm-' + stage);
    const section = body?.closest('.pl-stage-section');

    if (countEl) countEl.textContent = jobs.length;

    // Restore collapse
    if (section && collapseStates[stage]) section.classList.add('collapsed');

    // Match score summary
    const scores = jobs.map(j => j.meta.matchScore).filter(s => typeof s === 'number');
    if (matchEl) {
      if (scores.length > 0) {
        const median = scores.sort((a,b) => a - b)[Math.floor(scores.length / 2)];
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        matchEl.textContent = 'Match: ' + min + '% – ' + median + '% – ' + max + '%';
      } else {
        matchEl.textContent = '';
      }
    }

    if (!body) continue;
    if (jobs.length === 0) {
      body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      continue;
    }

    let html = '<table class="pl-table"><thead><tr>';
    html += '<th></th><th>Title</th><th>Company</th><th>Resume</th><th>Filters</th>';
    html += '<th>Discovered</th><th>Day Applied</th><th>Days In Stage</th>';
    html += '<th>Match</th><th>Move</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const item of jobs) {
      const j = item.job;
      const m = item.meta;
      const title = j ? (j.title || 'Untitled') : 'Unknown job';
      const company = j ? (j.company_name || '') : '';
      const discovered = j?.first_seen_at ? new Date(j.first_seen_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const appliedDate = m.appliedAt ? new Date(m.appliedAt) : null;
      const dayApplied = appliedDate ? appliedDate.toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const resumeName = m.resumeUsed || '—';

      // Days in current stage — use the most recent stage timestamp
      const stageDate = m.respondedAt ? new Date(m.respondedAt) :
                        m.appliedAt ? new Date(m.appliedAt) :
                        m.savedAt ? new Date(m.savedAt) : null;
      const daysInStage = stageDate ? Math.floor((now - stageDate) / 86400000) : '—';

      // Staleness dot — stage-specific thresholds
      let staleDot = '';
      if (typeof daysInStage === 'number') {
        const staleRules = {
          saved:     { yellow: 5, red: 7 },
          applied:   { yellow: 7, red: 14 },
          responded: { yellow: 7, red: 14 },
          interview: { yellow: 7, red: 14 },
        };
        const rule = staleRules[stage];
        if (rule) {
          if (daysInStage >= rule.red) {
            staleDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);" title="' + daysInStage + 'd — needs attention"></span>';
          } else if (daysInStage >= rule.yellow) {
            staleDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;" title="' + daysInStage + 'd in stage"></span>';
          }
        }
      }

      // Filter tag badges
      const filterBadges = (m.filterTags || []).map(tag => {
        const idx = sf.findIndex(f => f.name === tag);
        const color = idx >= 0 ? filterColors[idx % filterColors.length] : 'var(--text-faint)';
        return '<span class="pl-filter-badge" style="background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + tag + '</span>';
      }).join(' ');

      // Match score
      const matchScore = typeof m.matchScore === 'number' ? m.matchScore + '%' : '—';
      const matchColor = typeof m.matchScore === 'number' ? (m.matchScore >= 70 ? 'color:var(--green);' : m.matchScore >= 40 ? 'color:var(--warm);' : 'color:var(--red);') : '';

      // Stage move dropdown
      let moveOpts = PL_STAGES.filter(s => s !== stage).map(s => {
        const labels = {saved:'Saved',applied:'Applied',posting_closed:'Posting Closed',responded:'Responded',interview:'Interview',offer:'Offer',rejected:'Rejected/Ghosted'};
        return '<option value="' + s + '">' + labels[s] + '</option>';
      }).join('');

      html += '<tr data-jobid="' + item.id + '">';
      html += '<td style="width:16px;text-align:center;padding:4px 2px;">' + staleDot + '</td>';
      html += '<td class="pl-title" onclick="openJobModal(\'' + item.id + '\')" title="' + title.replace(/"/g, '&quot;') + '">' + (title.length > 35 ? title.slice(0,35) + '…' : title) + '</td>';
      html += '<td class="pl-company" title="' + company.replace(/"/g, '&quot;') + '">' + (company.length > 20 ? company.slice(0,20) + '…' : company) + '</td>';
      html += '<td>' + (resumeName !== '—' ? '<span class="pl-resume-badge" title="' + resumeName + '">' + resumeName + '</span>' : '<span style="color:var(--text-faint);font-size:11px;">—</span>') + '</td>';
      html += '<td>' + (filterBadges || '<span style="color:var(--text-faint);font-size:10px;">—</span>') + '</td>';
      html += '<td class="pl-date">' + discovered + '</td>';
      html += '<td class="pl-date">' + dayApplied + '</td>';
      html += '<td class="pl-days">' + daysInStage + (typeof daysInStage === 'number' ? 'd' : '') + '</td>';
      html += '<td class="pl-match" style="' + matchColor + '">' + matchScore + '</td>';
      html += '<td><select class="pl-move-select" onchange="movePipelineStage(\'' + item.id + '\', this.value)"><option value="">Move…</option>' + moveOpts + '</select></td>';
      html += '<td><button class="job-action-btn hide-btn" onclick="unsaveFromPipeline(\'' + item.id + '\')" style="padding:2px 6px;font-size:9px;" title="Remove from pipeline">✕</button></td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  }

  // Update stats
  const appliedAndBeyond = stageJobs.applied.length + stageJobs.posting_closed.length + stageJobs.responded.length + stageJobs.interview.length + stageJobs.offer.length + stageJobs.rejected.length;
  $('#p-total').textContent = totalTracked;
  $('#p-active').textContent = activeCount;
  const responseRate = appliedAndBeyond > 0 ? Math.round((respondedCount / appliedAndBeyond) * 100) + '%' : '—';
  $('#p-response').textContent = responseRate;
  const avgDays = respondedCount > 0 ? Math.round(totalDaysToResponse / respondedCount) + 'd' : '—';
  $('#p-avg-days').textContent = avgDays;

  // Update nav dot
  if (typeof updatePipelineNavDot === 'function') updatePipelineNavDot();
}

// Legacy compat: renderPipelineSaved calls renderPipeline
async function renderPipelineSaved() { await renderPipeline(); }

function addToPipeline(jobId, row) {
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { stage: 'applied', savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = 'applied';
  if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  savePipelineMeta(meta);
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}



// === js/tuning.js ===
// ============================================================
// RESUME PICKER ON APPLY
// ============================================================
let _rpCallback = null;
let _rpSelected = null;
let _rpJobId = null;

function showResumePicker(jobId, callback) {
  _rpJobId = jobId;
  _rpCallback = callback;
  _rpSelected = null;

  const resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const optionsEl = $('#rp-options');

  if (resumes.length === 0) {
    // No resumes uploaded — skip picker, go straight through
    callback(null);
    return;
  }

  // Try to pre-select: find resume assigned to checked filters
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  const autoMatch = resumes.find(r => !r.archived && r.filterIds?.some(f => checkedFilters.includes(f)));
  if (autoMatch) _rpSelected = autoMatch.name;

  let html = '';
  resumes.filter(r => !r.needsUpload && !r.archived).forEach(r => {
    const sel = r.name === _rpSelected ? ' selected' : '';
    const filterNames = (r.filterIds || []).join(', ');
    const levelStr = r.levelLabel ? r.levelLabel + ' · ' : '';
    const meta = [levelStr + r.fileName, r.size, filterNames ? 'Filters: ' + filterNames : ''].filter(Boolean).join(' · ');
    html += `<div class="rp-option${sel}" data-rp-name="${r.name.replace(/"/g, '&quot;')}" onclick="selectResumePick(this)">
      <div class="rp-radio"></div>
      <div>
        <div class="rp-name">${r.name}${r.levelLabel ? ' <span style="color:' + (r.levelColor || '#94a3b8') + ';font-size:10px;">' + r.levelLabel + '</span>' : ''}</div>
        <div class="rp-meta">${meta}</div>
      </div>
    </div>`;
  });

  if (html === '') {
    // All resumes are placeholders
    callback(null);
    return;
  }

  optionsEl.innerHTML = html;
  $('#resume-picker-overlay').classList.add('open');
}

function selectResumePick(el) {
  $$('#rp-options .rp-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _rpSelected = el.dataset.rpName;
}

function confirmResumePick() {
  closeResumePicker(false);
  if (_rpCallback) _rpCallback(_rpSelected);
}

function closeResumePicker(skip) {
  $('#resume-picker-overlay').classList.remove('open');
  if (skip && _rpCallback) _rpCallback(null);
  _rpCallback = null;
}

// Init pipeline
migratePipelineData();
buildPipelineFilterTags();
setTimeout(() => renderPipeline(), 800);


// ============================================================
// TUNING — Global search settings
// ============================================================
// ---- Tuning card collapse persistence ----
function toggleTuningCard(header) {
  const card = header.parentElement;
  card.classList.toggle('collapsed');
  saveTuningCollapseStates();
}

function saveTuningCollapseStates() {
  const states = JSON.parse(localStorage.getItem('bj_collapse') || '{}');
  states.tuning = {};
  $$('.tuning-card').forEach(card => {
    if (card.id) states.tuning[card.id] = card.classList.contains('collapsed');
  });
  localStorage.setItem('bj_collapse', JSON.stringify(states));
}

// Restore tuning card states
(function() {
  const states = JSON.parse(localStorage.getItem('bj_collapse') || '{}');
  const tuning = states.tuning || {};
  Object.entries(tuning).forEach(([id, collapsed]) => {
    const card = document.getElementById(id);
    if (card && collapsed) card.classList.add('collapsed');
  });
})();

tuningSettings = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
tuningLocExclPills = tuningSettings.locationExcludes || [];
tuningTitleExclPills = tuningSettings.titleExcludes || [];
tuningCoExclPills = tuningSettings.companyExcludes || [];
tuningIndExclPills = tuningSettings.industryExcludes || [];

function saveTuning() {
  tuningSettings.usOnly = $('#tuning-us-only').checked;
  tuningSettings.excludeHourly = $('#tuning-exclude-hourly').checked;
  tuningSettings.locationExcludes = tuningLocExclPills;
  tuningSettings.titleExcludes = tuningTitleExclPills;
  tuningSettings.companyExcludes = tuningCoExclPills;
  tuningSettings.industryExcludes = tuningIndExclPills;
  saveUserData('bj_tuning', JSON.stringify(tuningSettings));
  updateTuningStatusDot();
}

function updateTuningStatusDot() {
  const dot = $('#tuning-status-dot');
  if (!dot) return;
  const hasCustom =
    tuningSettings.usOnly ||
    tuningSettings.excludeHourly ||
    (tuningLocExclPills && tuningLocExclPills.length > 0) ||
    (tuningTitleExclPills && tuningTitleExclPills.length > 0) ||
    (tuningCoExclPills && tuningCoExclPills.length > 0) ||
    (tuningIndExclPills && tuningIndExclPills.length > 0) ||
    (tuningSettings.levelHierarchy && JSON.stringify(tuningSettings.levelHierarchy) !== JSON.stringify(DEFAULT_LEVELS));
  if (hasCustom) {
    dot.className = 'ext-status-dot connected';
    dot.title = 'Custom rules active';
  } else {
    dot.className = 'ext-status-dot warning';
    dot.title = 'Default settings — no custom rules';
  }
}

// ---- Title Level Hierarchy ----
const DEFAULT_LEVELS = [
  { label: 'C-Suite', keywords: 'ceo, cto, cmo, cfo, cro, coo, chief', color: '#ef4444' },
  { label: 'VP', keywords: 'vice president, vp, svp, evp', color: '#f97316' },
  { label: 'Sr Director', keywords: 'senior director, sr director, sr. director', color: '#f59e0b' },
  { label: 'Director', keywords: 'director', color: '#eab308' },
  { label: 'Assoc Director', keywords: 'associate director, asst director, assistant director', color: '#84cc16' },
  { label: 'Sr Manager', keywords: 'senior manager, sr manager, sr. manager', color: '#22c55e' },
  { label: 'Lead', keywords: 'lead, principal, head of', color: '#06b6d4' },
  { label: 'Manager', keywords: 'manager', color: '#14b8a6' },
  { label: 'Senior', keywords: 'senior, sr, sr.', color: '#3b82f6' },
  { label: 'Mid', keywords: 'associate, coordinator', color: '#8b5cf6' },
  { label: 'Entry', keywords: 'junior, jr, intern, entry', color: '#a855f7' },
];
levelHierarchy = tuningSettings.levelHierarchy || JSON.parse(JSON.stringify(DEFAULT_LEVELS));

function saveLevels() {
  tuningSettings.levelHierarchy = levelHierarchy;
  saveUserData('bj_tuning', JSON.stringify(tuningSettings));
  updateTuningBadges();
}

function renderLevelTable() {
  const tbody = $('#level-table-body');
  tbody.innerHTML = '';
  levelHierarchy.forEach((lvl, i) => {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td class="level-rank">${i + 1}</td>
      <td><input class="level-name" data-idx="${i}" data-field="label" value="${(lvl.label||'').replace(/"/g,'&quot;')}" placeholder="Level name"></td>
      <td><input data-idx="${i}" data-field="keywords" value="${(lvl.keywords||'').replace(/"/g,'&quot;')}" placeholder="keyword1, keyword2, …"></td>
      <td><button class="level-del" data-idx="${i}">✕</button></td>
    `;
    tbody.appendChild(tr);

    // Drag handlers
    tr.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i);
      tr.style.opacity = '0.4';
    });
    tr.addEventListener('dragend', () => { tr.style.opacity = ''; });
    tr.addEventListener('dragover', e => { e.preventDefault(); tr.style.background = 'var(--bg-hover)'; });
    tr.addEventListener('dragleave', () => { tr.style.background = ''; });
    tr.addEventListener('drop', e => {
      e.preventDefault();
      tr.style.background = '';
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = i;
      if (fromIdx === toIdx) return;
      const [moved] = levelHierarchy.splice(fromIdx, 1);
      levelHierarchy.splice(toIdx, 0, moved);
      saveLevels();
      renderLevelTable();
    });
  });

  // Bind input changes
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      levelHierarchy[idx][field] = inp.value.trim();
      saveLevels();
    });
  });

  // Bind delete
  tbody.querySelectorAll('.level-del').forEach(btn => {
    btn.addEventListener('click', () => {
      levelHierarchy.splice(parseInt(btn.dataset.idx), 1);
      saveLevels();
      renderLevelTable();
    });
  });
}

$('#level-add-btn').addEventListener('click', () => {
  levelHierarchy.push({ label: '', keywords: '', color: '#94a3b8' });
  saveLevels();
  renderLevelTable();
  // Focus the new name input
  const lastInput = $('#level-table-body').querySelector('tr:last-child input.level-name');
  if (lastInput) lastInput.focus();
});

renderLevelTable();

// ---- Level Matching Engine ----
// Matches a job title against the hierarchy, longest keyword first to avoid partial matches
function getJobLevel(title, hierarchy) {
  const levels = hierarchy || levelHierarchy;
  if (!title || levels.length === 0) return null;
  const t = ' ' + title.toLowerCase() + ' ';
  // Build flat list of {keyword, rank, label, color} sorted by keyword length desc
  const entries = [];
  levels.forEach((lvl, rank) => {
    (lvl.keywords || '').split(',').forEach(kw => {
      const k = kw.trim().toLowerCase();
      if (k) entries.push({ keyword: k, rank, label: lvl.label, color: lvl.color || '#94a3b8' });
    });
  });
  // Sort longest first so "senior director" matches before "director"
  entries.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const e of entries) {
    // Word boundary check: keyword must be preceded/followed by space, hyphen, slash, paren, comma, or start/end
    const escaped = e.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s,\\-\\/\\(])${escaped}(?:[\\s,\\-\\/\\)]|$)`, 'i');
    if (re.test(t)) {
      return { rank: e.rank, label: e.label, color: e.color };
    }
  }
  return null;
}

// Restore state
if (tuningSettings.usOnly) $('#tuning-us-only').checked = true;
if (tuningSettings.excludeHourly) $('#tuning-exclude-hourly').checked = true;

// Per-filter level hierarchy editor — uses a modal-style overlay
window.editFilterLevelHierarchy = function(filterIdx) {
  const sf = savedFilters[filterIdx];
  if (!sf) return;

  // If filter has no custom hierarchy, start from default
  let filterLevels = sf.levelHierarchy
    ? JSON.parse(JSON.stringify(sf.levelHierarchy))
    : JSON.parse(JSON.stringify(levelHierarchy));

  // Level assignments: which levels this filter targets
  let assignedLevels = sf.assignedLevels ? [...sf.assignedLevels] : [];
  let includeOther = sf.includeOtherLevels || false;

  // Build overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

  function getOtherFilterAssignments() {
    const map = {};
    savedFilters.forEach((f, i) => {
      if (i === filterIdx || !f.assignedLevels) return;
      f.assignedLevels.forEach(lbl => {
        if (!map[lbl]) map[lbl] = [];
        map[lbl].push({ name: f.name, idx: i });
      });
    });
    return map;
  }

  function renderModal() {
    const isCustom = !!sf.levelHierarchy;
    const otherAssignments = getOtherFilterAssignments();
    const hasAnyAssigned = assignedLevels.length > 0;

    overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:580px;width:90%;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">Levels — ${sf.name}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px;">
            Select which seniority levels this filter targets
          </div>
        </div>
        <button id="fl-close" style="background:none;border:none;font-size:20px;color:var(--text-faint);cursor:pointer;padding:4px 8px;">✕</button>
      </div>

      <!-- Level assignment section -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-faint);margin-bottom:8px;">Assigned Levels</div>
        <div id="fl-level-checks" style="display:flex;flex-direction:column;gap:4px;"></div>
        ${hasAnyAssigned ? `
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;background:var(--bg-input);border-radius:8px;cursor:pointer;">
          <input type="checkbox" id="fl-include-other" ${includeOther ? 'checked' : ''} style="accent-color:var(--accent);">
          <span style="font-size:12px;color:var(--text-dim);">Include Other Levels</span>
          <span style="font-size:10px;color:var(--text-faint);margin-left:auto;">Levels not assigned to any filter</span>
        </label>` : `
        <div style="padding:8px 12px;background:var(--bg-input);border-radius:8px;margin-top:8px;font-size:11px;color:var(--text-faint);">
          No levels selected — this filter matches <strong>all levels</strong>
        </div>`}
      </div>

      <!-- Hierarchy editor -->
      <details style="margin-bottom:16px;">
        <summary style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-faint);cursor:pointer;padding:4px 0;">
          ${isCustom ? '⚙ Custom Hierarchy (click to edit)' : '⚙ Level Hierarchy (click to customize)'}
        </summary>
        <div style="margin-top:8px;">
          <table class="level-table">
            <thead><tr>
              <th style="width:36px;">#</th>
              <th style="width:130px;">Level</th>
              <th>Match Keywords</th>
              <th style="width:40px;"></th>
            </tr></thead>
            <tbody id="fl-tbody"></tbody>
          </table>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button id="fl-add" class="btn btn-sm" style="padding:4px 14px;font-size:11px;background:transparent;color:var(--accent);border:1px solid var(--accent);cursor:pointer;">+ Add Level</button>
            <button id="fl-reset" class="btn btn-sm" style="padding:4px 14px;font-size:11px;background:transparent;color:var(--text-faint);border:1px solid var(--border);cursor:pointer;">Reset to Default</button>
          </div>
        </div>
      </details>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="fl-cancel" class="btn btn-sm" style="padding:6px 16px;font-size:12px;background:transparent;color:var(--text-faint);border:1px solid var(--border);cursor:pointer;">Cancel</button>
        <button id="fl-save" class="btn btn-sm btn-primary" style="padding:6px 20px;font-size:12px;">Save</button>
      </div>
    </div>`;

    // Render level checkboxes
    const checksEl = overlay.querySelector('#fl-level-checks');
    filterLevels.forEach((lvl, i) => {
      const isAssigned = assignedLevels.includes(lvl.label);
      const otherFilter = otherAssignments[lvl.label];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);' + (isAssigned ? 'background:var(--accent-glow);border-color:rgba(61,126,255,0.3);' : '');
      row.innerHTML = `
        <input type="checkbox" class="fl-level-cb" data-label="${(lvl.label||'').replace(/"/g,'&quot;')}" ${isAssigned ? 'checked' : ''} style="accent-color:var(--accent);">
        <span style="width:10px;height:10px;border-radius:50%;background:${lvl.color || '#94a3b8'};flex-shrink:0;"></span>
        <span style="font-size:13px;font-weight:500;color:var(--text);flex:1;">${lvl.label || 'Unnamed'}</span>
        ${otherFilter ? `<span style="font-size:10px;color:var(--warm);font-weight:500;">${otherFilter.map(f=>f.name).join(', ')}</span>` : ''}
      `;
      checksEl.appendChild(row);
    });

    // Bind checkbox changes with overlap detection
    checksEl.querySelectorAll('.fl-level-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const label = cb.dataset.label;
        if (cb.checked) {
          const otherFilter = otherAssignments[label];
          if (otherFilter && otherFilter.length > 0) {
            // Overlap detected — show resolution popup
            showLevelOverlapPopup(label, otherFilter, (action) => {
              if (action === 'take') {
                // Remove from other filters
                otherFilter.forEach(f => {
                  const other = savedFilters[f.idx];
                  if (other && other.assignedLevels) {
                    other.assignedLevels = other.assignedLevels.filter(l => l !== label);
                  }
                });
                saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
                assignedLevels.push(label);
              } else if (action === 'other') {
                // Remove from other filters, don't add to this one — it becomes "Other"
                otherFilter.forEach(f => {
                  const other = savedFilters[f.idx];
                  if (other && other.assignedLevels) {
                    other.assignedLevels = other.assignedLevels.filter(l => l !== label);
                  }
                });
                saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
                cb.checked = false;
              } else {
                cb.checked = false; // cancelled
              }
              renderModal();
            });
            return;
          }
          assignedLevels.push(label);
        } else {
          assignedLevels = assignedLevels.filter(l => l !== label);
        }
        renderModal();
      });
    });

    // Include Other toggle
    const otherCb = overlay.querySelector('#fl-include-other');
    if (otherCb) {
      otherCb.addEventListener('change', () => { includeOther = otherCb.checked; });
    }

    // Render hierarchy table
    const tbody = overlay.querySelector('#fl-tbody');
    filterLevels.forEach((lvl, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="level-rank">${i + 1}</td>
        <td><input class="level-name" data-i="${i}" data-f="label" value="${(lvl.label||'').replace(/"/g,'&quot;')}" placeholder="Level name"></td>
        <td><input data-i="${i}" data-f="keywords" value="${(lvl.keywords||'').replace(/"/g,'&quot;')}" placeholder="keyword1, keyword2"></td>
        <td><button class="level-del" data-i="${i}" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        filterLevels[parseInt(inp.dataset.i)][inp.dataset.f] = inp.value.trim();
      });
    });
    tbody.querySelectorAll('.level-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const lbl = filterLevels[parseInt(btn.dataset.i)].label;
        filterLevels.splice(parseInt(btn.dataset.i), 1);
        assignedLevels = assignedLevels.filter(l => l !== lbl);
        renderModal();
      });
    });

    overlay.querySelector('#fl-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#fl-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#fl-add').addEventListener('click', () => {
      filterLevels.push({ label: '', keywords: '', color: '#94a3b8' });
      renderModal();
    });
    overlay.querySelector('#fl-reset').addEventListener('click', () => {
      filterLevels = JSON.parse(JSON.stringify(levelHierarchy));
      delete savedFilters[filterIdx].levelHierarchy;
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      renderModal();
    });
    overlay.querySelector('#fl-save').addEventListener('click', () => {
      savedFilters[filterIdx].levelHierarchy = JSON.parse(JSON.stringify(filterLevels));
      savedFilters[filterIdx].assignedLevels = assignedLevels.length > 0 ? [...assignedLevels] : undefined;
      savedFilters[filterIdx].includeOtherLevels = assignedLevels.length > 0 ? includeOther : undefined;
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      overlay.remove();
      renderSavedFilters();
      debouncedSearchJobs();
    });
  }

  renderModal();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// Level overlap resolution popup
function showLevelOverlapPopup(levelLabel, otherFilters, callback) {
  const names = otherFilters.map(f => f.name).join(' & ');
  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;';
  popup.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:400px;width:90%;">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">Level Overlap</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;line-height:1.6;">
        <strong style="color:var(--warm);">${levelLabel}</strong> is already assigned to <strong>${names}</strong>. What would you like to do?
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="lo-take" style="padding:10px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent-glow);color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;text-align:left;">
          Assign to this filter<br><span style="font-weight:400;font-size:10px;color:var(--text-faint);">Remove from ${names}</span>
        </button>
        <button id="lo-other" style="padding:10px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-size:12px;font-weight:600;cursor:pointer;text-align:left;">
          Move to Other Levels<br><span style="font-weight:400;font-size:10px;color:var(--text-faint);">Unassign from ${names}, available as "Other"</span>
        </button>
        <button id="lo-cancel" style="padding:8px 16px;border:none;background:none;color:var(--text-faint);font-size:11px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  popup.querySelector('#lo-take').addEventListener('click', () => { popup.remove(); callback('take'); });
  popup.querySelector('#lo-other').addEventListener('click', () => { popup.remove(); callback('other'); });
  popup.querySelector('#lo-cancel').addEventListener('click', () => { popup.remove(); callback('cancel'); });
  popup.addEventListener('click', e => { if (e.target === popup) { popup.remove(); callback('cancel'); } });
  document.body.appendChild(popup);
}


// Render tuning pills
function renderTuningPills() {
  const tuningOnRemove = () => { saveTuning(); renderTuningPills(); updateTuningBadges(); };
  renderPillsFor(tuningLocExclPills, '#tuning-location-exclude', '#tuning-loc-excl-input', false, 'not-pill', tuningOnRemove);
  renderPillsFor(tuningTitleExclPills, '#tuning-title-exclude', '#tuning-title-excl-input', false, 'not-pill', tuningOnRemove);
  renderPillsFor(tuningCoExclPills, '#tuning-company-exclude', '#tuning-co-excl-input', false, 'not-pill', tuningOnRemove);
  // Industry pills — render as not-pills with remove buttons
  const indBuilder = $('#tuning-industry-exclude');
  const indInput = $('#tuning-ind-excl-input');
  if (indBuilder) {
    indBuilder.querySelectorAll('.qb-pill').forEach(p => p.remove());
    tuningIndExclPills.forEach((pill, i) => {
      const name = typeof pill === 'string' ? pill : (pill.values ? pill.values[0] : pill);
      const span = document.createElement('span');
      span.className = 'qb-pill not-pill';
      span.innerHTML = `${name} <span class="qb-pill-x" data-idx="${i}">✕</span>`;
      indBuilder.insertBefore(span, indInput);
    });
    // Attach remove handlers
    indBuilder.querySelectorAll('.qb-pill-x').forEach(x => {
      x.addEventListener('click', e => {
        const idx = parseInt(e.target.dataset.idx);
        tuningIndExclPills.splice(idx, 1);
        saveTuning(); renderTuningPills();
      });
    });
  }
}
renderTuningPills();
updateTuningStatusDot();

function updateTuningBadges() {
  // Location: count pills + US-only checkbox
  const locCount = tuningLocExclPills.length + ($('#tuning-us-only')?.checked ? 1 : 0);
  const locBadge = $('#tc-loc-badge');
  if (locBadge) {
    locBadge.textContent = locCount > 0 ? `${locCount} rule${locCount > 1 ? 's' : ''}` : '';
    locBadge.classList.toggle('empty', locCount === 0);
  }

  // Company
  const coCount = tuningCoExclPills.length;
  const coBadge = $('#tc-co-badge');
  if (coBadge) {
    coBadge.textContent = coCount > 0 ? `${coCount} excluded` : '';
    coBadge.classList.toggle('empty', coCount === 0);
  }

  // Industry
  const indCount = tuningIndExclPills.length;
  const indBadge = $('#tc-ind-badge');
  if (indBadge) {
    indBadge.textContent = indCount > 0 ? `${indCount} excluded` : '';
    indBadge.classList.toggle('empty', indCount === 0);
  }

  // Title: count exclusion pills + level count
  const titleExclCount = tuningTitleExclPills.length;
  const levelCount = (tuningSettings.levelHierarchy || []).length;
  const titleBadge = $('#tc-title-badge');
  if (titleBadge) {
    const parts = [];
    if (levelCount > 0) parts.push(`${levelCount} levels`);
    if (titleExclCount > 0) parts.push(`${titleExclCount} excluded`);
    titleBadge.textContent = parts.length > 0 ? parts.join(' · ') : '';
    titleBadge.classList.toggle('empty', parts.length === 0);
  }

  // Poor matches
  const poorCount = hiddenJobIds ? hiddenJobIds.length : 0;
  const poorBadge = $('#tc-poor-badge');
  if (poorBadge) {
    poorBadge.textContent = poorCount > 0 ? `${poorCount} hidden` : '';
    poorBadge.classList.toggle('empty', poorCount === 0);
  }
}
updateTuningBadges();

// ---- Industry typeahead ----
let industryCache = null; // { industries: [{name, category}], loaded: bool }
let industryDropdownIdx = -1;

async function loadIndustryCache() {
  if (industryCache) return industryCache;
  try {
    const { data } = await sb.from('ref_industries').select('name, category').order('name');
    industryCache = data || [];
  } catch (e) {
    console.warn('[BJ] Failed to load industries:', e);
    industryCache = [];
  }
  return industryCache;
}

async function searchIndustries(query) {
  const industries = await loadIndustryCache();
  const q = query.toLowerCase().trim();
  if (!q) return industries.slice(0, 20);
  return industries.filter(ind =>
    ind.name.includes(q) || (ind.category || '').toLowerCase().includes(q)
  ).slice(0, 15);
}

function renderIndustryDropdown(results) {
  const dd = $('#industry-dropdown');
  if (!results || results.length === 0) { dd.classList.remove('open'); return; }
  industryDropdownIdx = -1;

  // Category badge colors
  const catColors = {
    'Technology': '#3b82f6', 'Healthcare': '#ef4444', 'Finance': '#f59e0b',
    'Education': '#8b5cf6', 'Marketing': '#ec4899', 'Engineering': '#06b6d4',
    'Manufacturing': '#6b7280', 'Energy': '#f97316', 'Real Estate': '#84cc16',
    'Retail & Consumer': '#14b8a6', 'Government': '#6366f1', 'Legal': '#a855f7',
    'Media & Entertainment': '#e879f9', 'Nonprofit': '#22c55e', 'Professional Services': '#64748b',
    'Logistics': '#0ea5e9', 'Other': '#9ca3af',
  };

  // Filter out already-selected industries
  const existing = new Set(tuningIndExclPills.map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)));
  const filtered = results.filter(r => !existing.has(r.name));
  if (filtered.length === 0) { dd.classList.remove('open'); return; }

  dd.innerHTML = filtered.map((ind, i) => {
    const cat = ind.category || 'Other';
    const color = catColors[cat] || '#9ca3af';
    return `<div class="company-opt" tabindex="0" data-name="${ind.name}" data-idx="${i}">
      <span style="font-weight:500;">${ind.name}</span>
      <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${color}22;color:${color};font-weight:600;">${cat}</span>
    </div>`;
  }).join('');
  dd.classList.add('open');

  // Click handlers on options
  dd.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault();
      selectIndustryFromDropdown(opt.dataset.name);
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); selectIndustryFromDropdown(opt.dataset.name); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else $('#tuning-ind-excl-input').focus(); }
      if (e.key === 'Escape') { dd.classList.remove('open'); $('#tuning-ind-excl-input').focus(); }
    });
  });
}

function selectIndustryFromDropdown(name) {
  if (!name) return;
  const existing = tuningIndExclPills.map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p));
  if (!existing.includes(name)) {
    tuningIndExclPills.push(name);
    saveTuning();
    renderTuningPills();
  }
  const input = $('#tuning-ind-excl-input');
  input.value = '';
  $('#industry-dropdown').classList.remove('open');
  industryDropdownIdx = -1;
}

// Wire up industry input
(function() {
  const input = $('#tuning-ind-excl-input');
  const dd = $('#industry-dropdown');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const results = await searchIndustries(input.value);
      renderIndustryDropdown(results);
    }, 150);
  });

  input.addEventListener('focus', async () => {
    if (input.value.length === 0) {
      const results = await searchIndustries('');
      renderIndustryDropdown(results);
    }
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) selectIndustryFromDropdown(focused.dataset.name);
      }
    }
    if (e.key === 'Backspace' && input.value === '' && tuningIndExclPills.length > 0) {
      tuningIndExclPills.pop();
      saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    // Delay to allow mousedown on dropdown to fire first
    setTimeout(() => { dd.classList.remove('open'); }, 150);
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-industry-exclude') && !e.target.closest('#industry-dropdown')) {
      dd.classList.remove('open');
    }
  });

  // Click on builder area focuses input
  $('#tuning-industry-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// Also refresh badges whenever tuning pills change
const _origRenderTuningPills = renderTuningPills;
renderTuningPills = function() { _origRenderTuningPills(); updateTuningBadges(); updateTuningStatusDot(); };

// Tuning input handlers (title only — generic pill commit)
const tuningInputs = [
  { input: '#tuning-title-excl-input', pills: () => tuningTitleExclPills, set: v => { tuningTitleExclPills = v; tuningSettings.titleExcludes = v; }, builder: '#tuning-title-exclude' },
];
tuningInputs.forEach(t => {
  const el = $(t.input);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(el, t.pills(), raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    } else if (e.key === 'Backspace' && el.value === '' && t.pills().length > 0) {
      t.pills().pop(); saveTuning(); renderTuningPills();
    }
  });
  el.addEventListener('blur', () => {
    commitPill(el, t.pills(), raw => ({ values: [raw], type: 'not' }));
    saveTuning(); renderTuningPills();
  });
  $(t.builder).addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) el.focus();
  });
});

// ---- Location Exclusion typeahead (Tuning) ----
(function() {
  const input = $('#tuning-loc-excl-input');
  const dd = $('#tuning-location-dropdown');
  if (!input || !dd) return;

  const badgeMap = {
    state: '<span style="font-size:9px;background:rgba(139,92,246,0.1);color:#8b5cf6;padding:1px 6px;border-radius:4px;font-weight:600;">state</span>',
    metro: '<span style="font-size:9px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-weight:600;">metro</span>',
    city: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">city</span>',
    remote: '<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">remote</span>',
    pin: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">📍</span>',
  };

  let debounceTimer;

  async function searchTuningLocations(query) {
    const ql = query.toLowerCase().trim();
    const results = [];
    const seenKeys = new Set();

    // US states
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
      if (!seenKeys.has(key)) { seenKeys.add(key); results.push({ display: `${name} (${code})`, badge: 'state' }); }
    }

    // ref_city_radius
    try {
      const { data: refData } = await sb.from('ref_city_radius').select('city, state, type')
        .or(`city.ilike.%${query}%,aliases.cs.{${query}}`).limit(10);
      if (refData) {
        for (const r of refData) {
          const display = r.type === 'metro' ? r.city : `${r.city}, ${r.state}`;
          const key = display.toLowerCase();
          if (!seenKeys.has(key)) { seenKeys.add(key); results.push({ display, badge: r.type === 'metro' ? 'metro' : 'city' }); }
        }
      }
    } catch (e) {}

    // location_cache
    try {
      const { data: cacheData } = await sb.from('location_cache').select('raw_input, normalized')
        .or(`raw_input.ilike.%${query}%,normalized.ilike.%${query}%`).limit(8);
      if (cacheData) {
        for (const loc of cacheData) {
          const display = loc.normalized || loc.raw_input;
          const key = display.toLowerCase();
          if (!seenKeys.has(key) && !key.startsWith('remote')) { seenKeys.add(key); results.push({ display, badge: 'pin' }); }
        }
      }
    } catch (e) {}

    // Remote
    if ('remote'.startsWith(ql)) {
      if (!seenKeys.has('remote')) { seenKeys.add('remote'); results.push({ display: 'Remote', badge: 'remote' }); }
    }

    return results.slice(0, 10);
  }

  function renderTuningLocDropdown(results, query) {
    // Filter out already-excluded
    const existing = new Set(tuningLocExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    }));
    const filtered = results.filter(r => !existing.has(r.display.toLowerCase()));
    if (filtered.length === 0) { dd.classList.remove('open'); return; }

    dd.innerHTML = filtered.map(r => {
      const badge = badgeMap[r.badge] || '';
      const hl = highlightCompanyMatch(r.display, query);
      return `<div class="company-opt" tabindex="0" data-name="${r.display.replace(/"/g,'&quot;')}">
        <span style="font-weight:500;">${hl}</span>${badge}</div>`;
    }).join('');
    dd.classList.add('open');

    dd.querySelectorAll('.company-opt').forEach(opt => {
      opt.addEventListener('mousedown', e => { e.preventDefault(); selectTuningLocation(opt.dataset.name); });
      opt.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); selectTuningLocation(opt.dataset.name); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else input.focus(); }
        if (e.key === 'Escape') { dd.classList.remove('open'); input.focus(); }
      });
    });
  }

  function selectTuningLocation(name) {
    if (!name) return;
    const existing = tuningLocExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    });
    if (!existing.includes(name.toLowerCase())) {
      tuningLocExclPills.push({ values: [name.toLowerCase()], type: 'not' });
      saveTuning();
      renderTuningPills();
    }
    input.value = '';
    dd.classList.remove('open');
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { dd.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const results = await searchTuningLocations(q);
      renderTuningLocDropdown(results, q);
    }, 200);
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) {
          selectTuningLocation(focused.dataset.name);
        } else {
          commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
          saveTuning(); renderTuningPills();
          dd.classList.remove('open');
        }
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    }
    if (e.key === 'Backspace' && input.value === '' && tuningLocExclPills.length > 0) {
      tuningLocExclPills.pop(); saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      dd.classList.remove('open');
      if (input.value.trim()) {
        commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
        saveTuning(); renderTuningPills();
      }
    }, 150);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-location-exclude') && !e.target.closest('#tuning-location-dropdown')) {
      dd.classList.remove('open');
    }
  });

  $('#tuning-location-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// ---- Company Exclusion typeahead ----
(function() {
  const input = $('#tuning-co-excl-input');
  const dd = $('#tuning-company-dropdown');
  if (!input || !dd) return;

  let debounceTimer;

  async function searchTuningCompanies(query) {
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
    } catch (e) {}

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
    } catch (e) {}

    return results;
  }

  function renderTuningCompanyDropdown(results, query) {
    // Filter out already-excluded companies
    const existing = new Set(tuningCoExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    }));
    const filtered = results.filter(r => !existing.has(r.name.toLowerCase()));
    if (filtered.length === 0) { dd.classList.remove('open'); return; }

    dd.innerHTML = filtered.map(r => {
      const badge = r.source === 'network'
        ? `<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">${r.connections} conn</span>`
        : `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.ats || 'ats'}</span>`;
      const hl = highlightCompanyMatch(r.name, query);
      return `<div class="company-opt" tabindex="0" data-name="${r.name.replace(/"/g, '&quot;')}">
        <span style="font-weight:500;">${hl}</span>${badge}</div>`;
    }).join('');
    dd.classList.add('open');

    dd.querySelectorAll('.company-opt').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        selectTuningCompany(opt.dataset.name);
      });
      opt.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); selectTuningCompany(opt.dataset.name); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else input.focus(); }
        if (e.key === 'Escape') { dd.classList.remove('open'); input.focus(); }
      });
    });
  }

  function selectTuningCompany(name) {
    if (!name) return;
    const existing = tuningCoExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    });
    if (!existing.includes(name.toLowerCase())) {
      tuningCoExclPills.push({ values: [name], type: 'not' });
      saveTuning();
      renderTuningPills();
    }
    input.value = '';
    dd.classList.remove('open');
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { dd.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const results = await searchTuningCompanies(q);
      renderTuningCompanyDropdown(results, q);
    }, 200);
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) {
          selectTuningCompany(focused.dataset.name);
        } else {
          // Manual entry — commit as plain text pill
          commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
          saveTuning(); renderTuningPills();
          dd.classList.remove('open');
        }
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    }
    if (e.key === 'Backspace' && input.value === '' && tuningCoExclPills.length > 0) {
      tuningCoExclPills.pop(); saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      dd.classList.remove('open');
      // Commit any remaining text
      if (input.value.trim()) {
        commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
        saveTuning(); renderTuningPills();
      }
    }, 150);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-company-exclude') && !e.target.closest('#tuning-company-dropdown')) {
      dd.classList.remove('open');
    }
  });

  $('#tuning-company-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// Checkboxes
$('#tuning-us-only').addEventListener('change', () => { saveTuning(); updateTuningBadges(); });

// Analyze hidden jobs for poor match suggestions
async function updatePoorMatchSuggestions() {
  const container = $('#tuning-poor-matches');
  const sugContainer = $('#tuning-suggestions');

  if (hiddenJobIds.length === 0) {
    container.innerHTML = '<span style="color:var(--text-faint);font-size:12px;">No hidden jobs yet. Hide irrelevant jobs from the feed and reasons will be tracked here.</span>';
    if (sugContainer) sugContainer.innerHTML = '';
    return;
  }

  // Backfill any hidden jobs missing title/company from Supabase
  const needsBackfill = hiddenJobIds.filter(h => !h.title);
  if (needsBackfill.length > 0) {
    const ids = needsBackfill.map(h => h.id);
    const { data: jobRows } = await sb.from('ats_jobs')
      .select('greenhouse_id, title, company_name, company_slug, url')
      .in('greenhouse_id', ids);
    if (jobRows) {
      const lookup = Object.fromEntries(jobRows.map(j => [j.greenhouse_id, j]));
      let changed = false;
      hiddenJobIds.forEach(h => {
        if (!h.title && lookup[h.id]) {
          h.title = lookup[h.id].title || '';
          h.company = lookup[h.id].company_name || '';
          h.url = lookup[h.id].url || '';
          h.companySlug = lookup[h.id].company_slug || '';
          changed = true;
        }
      });
      if (changed) saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
    }
  }

  // Show recent hidden jobs (newest first, max 20)
  const recent = [...hiddenJobIds].reverse().slice(0, 20);
  let html = `<div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${hiddenJobIds.length} hidden job${hiddenJobIds.length !== 1 ? 's' : ''}</div>`;

  recent.forEach((h, i) => {
    const reasonLabel = HIDE_REASONS.find(r => r.key === h.reason)?.label || h.reason || 'Hidden';
    const dateStr = h.hiddenAt ? new Date(h.hiddenAt).toLocaleDateString() : '';
    const titleText = h.title || 'Unknown Job';
    const jobUrl = h.url && h.url.startsWith('http') ? h.url : h.url ? 'https://boards.greenhouse.io' + h.url : (h.companySlug ? `https://boards.greenhouse.io/${h.companySlug}/jobs/${h.id}` : '');
    const titleHtml = jobUrl
      ? `<a href="${jobUrl}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">${titleText}</a>`
      : titleText;
    html += `<div class="poor-match-card">
      <div class="poor-match-info">
        <div class="poor-match-title" title="${(h.title||'').replace(/"/g,'&quot;')}">${titleHtml}</div>
        <div class="poor-match-meta">${h.company || ''}${dateStr ? ' · ' + dateStr : ''}</div>
      </div>
      <span class="poor-match-reason">${reasonLabel}</span>
      <button class="poor-match-unhide" onclick="analyzeHiddenJob('${h.id}', this)" style="background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(77,142,255,0.15));color:var(--accent);border:1px solid rgba(77,142,255,0.3);" title="AI analysis of why this was a poor match — suggests exclusion rules">✦ Add Exclusion</button>
      <button class="poor-match-unhide" onclick="unhideJob('${h.id}', this)">Unhide</button>
    </div>`;
  });

  if (hiddenJobIds.length > 20) {
    html += `<div style="font-size:11px;color:var(--text-faint);margin-top:8px;text-align:center;">+ ${hiddenJobIds.length - 20} more hidden</div>`;
  }

  container.innerHTML = html;

  // Pattern analysis — suggest exclusions based on common words in hidden job titles/companies
  if (!sugContainer) return;

  // Analyze title words (2+ occurrences)
  const stopWords = new Set(['the','and','or','a','an','of','for','in','at','to','with','on','is','are','we','our','this','that','you','your','it','as','be','by','from','has','have','will','can','do','all','not','but','if','so','no','up','about','into','out','just','new','one','its','been','more','also','was','were','than','other','they','had','each','very','how','may']);
  const titleWords = {};
  const compCounts = {};

  hiddenJobIds.forEach(h => {
    // Count title keywords
    if (h.title) {
      const words = h.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      const seen = new Set();
      words.forEach(w => {
        if (!seen.has(w)) { titleWords[w] = (titleWords[w] || 0) + 1; seen.add(w); }
      });
    }
    // Count companies
    if (h.company) {
      const co = h.company.trim();
      if (co) compCounts[co] = (compCounts[co] || 0) + 1;
    }
  });

  // Get tuning exclusions to avoid suggesting already-excluded terms
  const tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
  const existingTitleExcl = new Set((tuning.titleExcludes || []).map(t => t.toLowerCase()));
  const existingCoExcl = new Set((tuning.companyExcludes || []).map(c => c.toLowerCase()));

  const titleSuggestions = Object.entries(titleWords)
    .filter(([w, c]) => c >= 2 && !existingTitleExcl.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const companySuggestions = Object.entries(compCounts)
    .filter(([co, c]) => c >= 2 && !existingCoExcl.has(co.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (titleSuggestions.length === 0 && companySuggestions.length === 0) {
    sugContainer.innerHTML = '';
    return;
  }

  let sugHtml = '<div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Suggested exclusions</div>';

  if (titleSuggestions.length > 0) {
    sugHtml += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:6px;">Title keywords appearing in multiple hidden jobs:</div><div style="display:flex;flex-wrap:wrap;gap:0;">';
    titleSuggestions.forEach(([word, count]) => {
      sugHtml += `<span class="suggestion-chip" onclick="addSuggestedExclusion('title', '${word}', this)">${word} <span class="chip-count">×${count}</span> <span style="color:var(--accent);">+</span></span>`;
    });
    sugHtml += '</div>';
  }

  if (companySuggestions.length > 0) {
    sugHtml += '<div style="font-size:11px;color:var(--text-faint);margin:10px 0 6px;">Companies you frequently hide:</div><div style="display:flex;flex-wrap:wrap;gap:0;">';
    companySuggestions.forEach(([co, count]) => {
      sugHtml += `<span class="suggestion-chip" onclick="addSuggestedExclusion('company', '${co.replace(/'/g, "\\'")}', this)">${co} <span class="chip-count">×${count}</span> <span style="color:var(--accent);">+</span></span>`;
    });
    sugHtml += '</div>';
  }

  sugContainer.innerHTML = sugHtml;
}

window.unhideJob = function(jobId, btn) {
  hiddenJobIds = hiddenJobIds.filter(h => h.id !== jobId);
  saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
  const card = btn.closest('.poor-match-card');
  if (card) card.style.opacity = '0.3';
  setTimeout(() => updatePoorMatchSuggestions(), 300);
};

window.addSuggestedExclusion = function(type, term, chip) {
  if (type === 'title') {
    if (!tuningTitleExclPills.some(t => t.toLowerCase() === term.toLowerCase())) {
      tuningTitleExclPills.push(term);
    }
  } else if (type === 'company') {
    if (!tuningCoExclPills.some(c => c.toLowerCase() === term.toLowerCase())) {
      tuningCoExclPills.push(term);
    }
  }
  saveTuning();
  renderTuningPills();
  // Visual feedback
  chip.style.background = 'var(--green-dim)';
  chip.style.borderColor = 'var(--green)';
  chip.style.color = 'var(--green)';
  chip.innerHTML = `✓ ${term} added`;
  chip.style.pointerEvents = 'none';
};

updatePoorMatchSuggestions();



// ─── Feature 2: AI Analysis of Hidden Jobs ───

async function analyzeHiddenJob(jobId, btn) {
  // Find the hidden job record
  var hidden = hiddenJobIds.find(function(h) { return h.id === jobId; });
  if (!hidden) return;
  
  // Get resume text — use the most recent non-archived resume
  var resumesWithText = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return r.extractedText && r.extractedText.length > 100 && !r.archived;
  });
  if (resumesWithText.length === 0) {
    alert('Upload a resume first (Resumes tab) to enable AI filter analysis.');
    return;
  }
  var resume = resumesWithText[resumesWithText.length - 1];
  
  // Get the source filter's pills if available
  var filterPills = null;
  if (hidden.filterIdxs && hidden.filterIdxs.length > 0 && typeof savedFilters !== 'undefined') {
    var srcFilter = savedFilters[hidden.filterIdxs[0]];
    if (srcFilter) {
      filterPills = {
        what: (srcFilter.whatPills || []).map(function(p) { return p.values; }).flat(),
        where: (srcFilter.wherePills || []).map(function(p) { return p.values; }).flat(),
        whatNot: (srcFilter.whatNotPills || []).map(function(p) { return p.values; }).flat(),
        whoNot: (srcFilter.whoNotPills || []).map(function(p) { return p.values; }).flat()
      };
    }
  }
  
  // Show modal with loading
  var modal = document.getElementById('ai-filter-modal');
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var meta = document.getElementById('ai-filter-meta');
  var titleEl = modal.querySelector('.job-modal-title');
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  footer.style.display = 'none';
  titleEl.textContent = '✦ Improve Filter';
  meta.textContent = 'Analyzing: ' + (hidden.title || 'Hidden job') + ' at ' + (hidden.company || '');
  body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
    '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
    '<div style="color:var(--text-dim);font-size:13px;">AI is analyzing why this was a poor match…</div></div>';
  
  try {
    var session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch(e) {}
    if (!session) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Please sign in to use AI features.</div>';
      return;
    }
    
    var resp = await fetch(SUPABASE_URL + '/functions/v1/analyze-hidden-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        job_id: jobId,
        resume_text: resume.extractedText.slice(0, 6000),
        filter_pills: filterPills
      })
    });
    
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return { error: 'Request failed' }; });
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">' + (err.error || 'AI analysis failed') + '</div>';
      return;
    }
    
    var data = await resp.json();
    // Store for accept handler
    window._analyzeHiddenData = data;
    window._analyzeHiddenFilterIdxs = hidden.filterIdxs || [];
    renderAnalyzeHiddenPreview(data, hidden);
    
  } catch (err) {
    console.error('[Analyze Hidden]', err);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Error: ' + err.message + '</div>';
  }
}

function renderAnalyzeHiddenPreview(data, hidden) {
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var acceptBtn = document.getElementById('ai-filter-accept');
  
  var html = '';
  
  // Mismatch summary
  if (data.mismatch_summary) {
    html += '<div style="padding:12px 16px;background:var(--bg);border-radius:8px;margin-bottom:20px;border-left:3px solid var(--accent);">';
    html += '<div style="font-size:13px;color:var(--text);line-height:1.5;">' + data.mismatch_summary + '</div>';
    html += '</div>';
  }
  
  // Target filter selector
  var filterIdxs = window._analyzeHiddenFilterIdxs || [];
  if (filterIdxs.length > 0 && typeof savedFilters !== 'undefined' && savedFilters[filterIdxs[0]]) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">Adding exclusions to: <strong style="color:var(--text);">' + savedFilters[filterIdxs[0]].name + '</strong></div>';
  } else {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">';
    html += '<label>Add exclusions to: <select id="analyze-target-filter" style="background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:2px 6px;font-size:11px;margin-left:4px;">';
    if (typeof savedFilters !== 'undefined') {
      savedFilters.forEach(function(sf, i) {
        html += '<option value="' + i + '">' + sf.name + '</option>';
      });
    }
    html += '</select></label></div>';
  }
  
  // Suggestions
  var sections = [
    { key: 'what_not', label: 'WHAT NOT — Exclude these title keywords', items: data.what_not || [], color: '#f87171' },
    { key: 'where_not', label: 'WHERE NOT — Exclude these locations', items: data.where_not || [], color: '#f59e0b' },
    { key: 'who_not', label: 'WHO NOT — Exclude these companies', items: data.who_not || [], color: '#fb923c' }
  ];
  
  var hasSuggestions = false;
  sections.forEach(function(sec) {
    if (sec.items.length === 0) return;
    hasSuggestions = true;
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + sec.label + '</div>';
    sec.items.forEach(function(item, i) {
      html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-section="' + sec.key + '" data-index="' + i + '" style="accent-color:' + sec.color + ';">';
      html += '<span style="color:var(--text);font-weight:500;">' + item.term + '</span>';
      html += '<span style="color:var(--text-faint);font-size:10px;margin-left:auto;">' + item.reason + '</span>';
      html += '</label>';
    });
    html += '</div>';
  });
  
  if (!hasSuggestions) {
    html += '<div style="text-align:center;padding:20px;color:var(--text-faint);font-size:13px;">No specific exclusions suggested. The mismatch may be too subtle for simple keyword filtering.</div>';
  }
  
  body.innerHTML = html;
  footer.style.display = hasSuggestions ? 'flex' : 'none';
  
  // Change accept button text and handler
  if (acceptBtn) {
    acceptBtn.textContent = 'Add to Filter';
    acceptBtn.onclick = acceptAnalyzeHidden;
  }
}

function acceptAnalyzeHidden() {
  var data = window._analyzeHiddenData;
  if (!data) return;
  
  // Determine target filter
  var filterIdx = -1;
  var filterIdxs = window._analyzeHiddenFilterIdxs || [];
  if (filterIdxs.length > 0) {
    filterIdx = filterIdxs[0];
  } else {
    var sel = document.getElementById('analyze-target-filter');
    if (sel) filterIdx = parseInt(sel.value);
  }
  
  if (filterIdx < 0 || !savedFilters[filterIdx]) {
    alert('No valid filter selected.');
    return;
  }
  
  var filter = savedFilters[filterIdx];
  
  // Collect checked items
  document.querySelectorAll('#ai-filter-body input[type="checkbox"][data-section]:checked').forEach(function(cb) {
    var sec = cb.dataset.section;
    var idx = parseInt(cb.dataset.index);
    var items = sec === 'what_not' ? data.what_not : sec === 'where_not' ? data.where_not : data.who_not;
    var item = items[idx];
    if (!item) return;
    
    var pill = { values: [item.term], type: sec === 'where_not' ? 'location' : 'keyword' };
    
    if (sec === 'what_not') {
      if (!filter.whatNotPills) filter.whatNotPills = [];
      // Don't duplicate
      if (!filter.whatNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whatNotPills.push(pill);
      }
    } else if (sec === 'where_not') {
      if (!filter.whereNotPills) filter.whereNotPills = [];
      if (!filter.whereNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whereNotPills.push(pill);
      }
    } else if (sec === 'who_not') {
      if (!filter.whoNotPills) filter.whoNotPills = [];
      if (!filter.whoNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whoNotPills.push(pill);
      }
    }
  });
  
  // Save updated filter
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  
  // Close modal
  closeAiFilterModal();
  window._analyzeHiddenData = null;
  window._analyzeHiddenFilterIdxs = null;
  
  // Refresh
  if (typeof renderSavedFilters === 'function') renderSavedFilters();
  if (typeof debouncedSearchJobs === 'function') debouncedSearchJobs();
}


// === js/resumes.js ===
// ============================================================
// RESUMES
// ============================================================
resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');

function saveResumes() {
  saveUserData('bj_resumes', JSON.stringify(resumes));
}

function getFileIcon(fileName) {
  if (/\.pdf$/i.test(fileName)) return { cls: 'pdf', text: 'PDF' };
  return { cls: 'doc', text: 'DOC' };
}

function renderResumes() {
  const grid = $('#resume-grid');
  const countEl = $('#r-total');
  const levelsEl = $('#r-levels');
  const assignedEl = $('#r-assigned');
  const archivedEl = $('#r-archived');

  const activeResumes = resumes.filter(r => !r.archived);
  const archivedResumes = resumes.filter(r => r.archived);
  countEl.textContent = activeResumes.length;
  archivedEl.textContent = archivedResumes.length;

  // Collapse upload zone when resumes exist
  const uploadZone = $('#resume-upload-zone');
  if (uploadZone) {
    if (activeResumes.length > 0) {
      uploadZone.style.padding = '8px 16px';
      uploadZone.style.minHeight = '0';
      uploadZone.style.cursor = 'pointer';
      uploadZone.innerHTML = '<input type="file" id="resume-file-input" accept=".pdf,.doc,.docx" style="display:none;" multiple>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--text-faint)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span style="font-size:11px;color:var(--text-faint);">Add another resume</span></div>';
      uploadZone.onclick = function() { $('#resume-file-input').click(); };
    } else {
      uploadZone.style.padding = '';
      uploadZone.style.minHeight = '';
      uploadZone.style.cursor = '';
      uploadZone.innerHTML = '<input type="file" id="resume-file-input" accept=".pdf,.doc,.docx" style="display:none;" multiple>' +
        '<h4>Drop resumes here or click to upload</h4><p>PDF, DOC, or DOCX — up to 5MB each</p>';
      uploadZone.onclick = function() { $('#resume-file-input').click(); };
    }
    // Re-bind file input change handler
    $('#resume-file-input').addEventListener('change', handleResumeFileInput);
  }

  // Level count
  const uniqueLevels = new Set(activeResumes.map(r => r.levelLabel).filter(Boolean));
  levelsEl.textContent = uniqueLevels.size;

  // Count filters assigned
  const totalAssigned = activeResumes.reduce((sum, r) => sum + (r.filterIds || []).length, 0);
  assignedEl.textContent = totalAssigned;

  // Coverage check
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const allAssignedFilterNames = new Set(activeResumes.flatMap(r => r.filterIds || []));
  const unassignedFilters = sf.filter(f => !allAssignedFilterNames.has(f.name));
  const coverageEl = $('#r-coverage');
  const coverageAlert = $('#resume-coverage-alert');

  if (sf.length > 0) {
    const covered = sf.length - unassignedFilters.length;
    coverageEl.textContent = `${covered}/${sf.length}`;
    coverageEl.style.color = unassignedFilters.length > 0 ? 'var(--text-dim)' : 'var(--green)';
  } else {
    coverageEl.textContent = '—';
  }

  if (unassignedFilters.length > 0 && activeResumes.length > 0) {
    coverageAlert.style.display = '';
    $('#resume-unassigned-list').innerHTML = unassignedFilters.map(f => {
      const fi = sf.indexOf(f);
      const color = filterColors[fi % filterColors.length];
      return `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${color}15;color:${color};border:1px solid ${color}30;margin:0 2px;">${f.name.toLowerCase()}</span>`;
    }).join(' ');
  } else {
    coverageAlert.style.display = 'none';
  }

  // Update nav dots
  updateResumeNavDot();

  if (activeResumes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="padding:32px 20px;">
      <h3>No resumes uploaded</h3>
      <p>Upload your first resume to get started.</p>
    </div>`;
    renderResumeArchive(archivedResumes);
    return;
  }

  // --- Build single resume card ---
  function buildResumeCard(r, sf, filterColors) {
    const i = resumes.indexOf(r);
    const icon = getFileIcon(r.fileName);
    const assignedIds = r.filterIds || [];
    const isPlaceholder = r.needsUpload;

    // Level selector
    const levels = (JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || []).filter(l => l.label);
    const levelOpts = levels.map(l => {
      const sel = r.levelLabel === l.label ? ' selected' : '';
      return `<option value="${l.label}" data-color="${l.color || '#94a3b8'}"${sel}>${l.label}</option>`;
    }).join('');
    const levelSelect = `<select class="pl-move-select" onchange="setResumeLevel(${i}, this)" style="min-width:100px;">
      <option value="">— Level —</option>
      ${levelOpts}
    </select>`;

    const gdriveIcon = r.source === 'gdrive'
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(66,133,244,0.1);color:#4285F4;">Drive</span>'
      : '';

    // G26: Tier provenance badge
    const tierBadge = r.source === 'rewrite'
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:linear-gradient(135deg,rgba(77,142,255,0.1),rgba(124,58,237,0.1));border:1px solid rgba(77,142,255,0.15);color:#4d8eff;cursor:help;" title="' + (r.tier_history || []).map(function(h) { return h.action + ' (' + h.tier + ')'; }).join(' → ') + '">✨ Premium Rewrite' + (r.rewrite_round > 1 ? ' R' + r.rewrite_round : '') + '</span>'
      : '';

    // Readiness grade from cache — shown inline on card
    let gradeHtml = '';
    if (!isPlaceholder) {
      // Always render the slot div so auto-analysis can populate it
      const hasCache = readinessCache && readinessCache.scores && readinessCache.scores[i];
      if (hasCache) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}">${buildInlineGrade(i, readinessCache.scores[i])}</div>`;
      } else if (r.textStatus === 'no-text' && r.fileName && /\.docx?$/i.test(r.fileName)) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:11px;color:var(--red);cursor:pointer;" onclick="reUploadResume(${i})" title="File needs re-upload for text extraction">⚠ Re-upload file to enable scoring <span style="text-decoration:underline;">Click here</span></div></div>`;
      } else if (r.textStatus === 'ready' && r.keywords && r.keywords.length > 0 && assignedIds.length > 0) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:10px;color:var(--text-faint);font-style:italic;">Analyzing\u2026</div></div>`;
      } else if (r.textStatus === 'ready' && r.keywords && r.keywords.length > 0 && assignedIds.length === 0) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:10px;color:var(--text-faint);">Assign a filter to see readiness grade</div></div>`;
      } else {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"></div>`;
      }
    }

    // Filter pills
    const filterPills = sf.length > 0
      ? sf.map((f, fi) => {
          const color = filterColors[fi % filterColors.length];
          const isActive = assignedIds.includes(f.name);
          return `<span class="rc-filter-pill ${isActive ? 'active' : 'inactive'}"
            style="background:${color}${isActive ? '22' : '10'};color:${color};border:1px solid ${color}${isActive ? '44' : '15'};"
            data-resume="${i}" data-filter="${f.name}" onclick="toggleResumeFilter(${i}, '${f.name.replace(/'/g, "\\\\'")}')"
            title="Click to ${isActive ? 'unassign' : 'assign'}">${f.name}</span>`;
        }).join('')
      : '<span style="font-size:11px;color:var(--text-faint);font-style:italic;">Save a filter first to assign</span>';

    // Performance stats
    const meta = getPipelineMeta();
    const jobsApplied = Object.values(meta).filter(m => m.resumeUsed === r.name && m.stage !== 'saved').length;
    const responded = Object.values(meta).filter(m => m.resumeUsed === r.name && ['responded','interview','offer'].includes(m.stage)).length;
    const responseRate = jobsApplied > 0 ? Math.round((responded / jobsApplied) * 100) : 0;
    const statsLine = jobsApplied > 0
      ? `<div style="font-size:10px;color:var(--text-faint);margin-top:6px;font-family:var(--mono);">${jobsApplied} applied \u00b7 ${responded} responded \u00b7 ${responseRate}% rate</div>`
      : '';

    return `
    <div class="resume-row ${isPlaceholder ? 'is-placeholder' : ''}">
      <div class="resume-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="rc-icon-sm ${icon.cls}" style="font-size:9px;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;${isPlaceholder ? 'opacity:0.4;border:2px dashed var(--border);' : ''}">${isPlaceholder ? '?' : icon.text}</div>
          <div style="min-width:0;flex:1;">
            <div class="rc-name" style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(r.name||'').replace(/"/g,'&quot;')}">${r.name}</div>
            ${!isPlaceholder ? `<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">${r.size} \u00b7 ${r.uploadedAt}</div>` : ''}
          </div>
          ${gdriveIcon}${tierBadge}
        </div>
        ${!isPlaceholder && r.textStatus === 'extracting' ? '<div style="font-size:10px;color:var(--warm);margin-bottom:6px;">Extracting keywords\u2026</div>' : ''}
        <div class="rc-grade-slot" id="rc-grade-${i}" style="display:none;"></div>
        ${isPlaceholder ? `<div style="margin:8px 0;padding:8px;background:rgba(245,158,11,0.06);border:1px dashed rgba(245,158,11,0.2);border-radius:8px;text-align:center;cursor:pointer;" onclick="replaceResumePlaceholder(${i})"><div style="font-size:11px;color:var(--warm);font-weight:600;">Upload File</div><div style="font-size:10px;color:var(--text-faint);">Replace placeholder with actual resume</div></div>` : ''}
        <div style="margin:8px 0;">${levelSelect}</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0;">${filterPills}</div>
        ${statsLine}
        <div class="rc-actions">
          <button class="rc-btn rc-download" onclick="downloadResume(${i})" title="Download resume file">Download</button>
          <button class="rc-btn rc-rename" onclick="renameResume(${i})">Rename</button>
          <button class="rc-btn rc-archive" onclick="archiveResume(${i})">Archive</button>
          <button class="rc-btn rc-delete" onclick="removeResume(${i})">Delete</button>
        </div>
      </div>
      <div class="readiness-side-slot" id="readiness-side-slot-${i}">${
        !isPlaceholder && readinessCache && readinessCache.scores && readinessCache.scores[i]
          ? buildReadinessSide(i, readinessCache.scores[i])
          : (assignedIds.length > 0 && !isPlaceholder
              ? '<div class="readiness-side" id="readiness-side-' + i + '" style="display:flex;align-items:center;justify-content:center;gap:8px;"><button class="btn btn-sm" id="rc-analyze-' + i + '" onclick="runReadinessAnalysis({resumeIndex:' + i + '})" style="background:var(--accent);color:#fff;font-weight:600;padding:6px 18px;">Analyze</button><button class="btn btn-sm" id="rc-deep-' + i + '" onclick="runReadinessAnalysis({resumeIndex:' + i + ',tier:\'premium\'})" style="background:linear-gradient(135deg,#4d8eff,#7c3aed);color:#fff;font-weight:600;padding:6px 14px;font-size:11px;" title="Multi-agent deep analysis with coaching">\u2728 Deep</button></div>'
              : '<div class="readiness-side" id="readiness-side-' + i + '"></div>')
      }</div>
    </div>`;
  }

  // --- Group resumes by filter ---
  let gridHtml = '';

  // Track which resumes have been placed
  const placed = new Set();

  // One section per saved filter (in order)
  sf.forEach((f, fi) => {
    const color = filterColors[fi % filterColors.length];
    const filterResumes = activeResumes
      .filter(r => (r.filterIds || []).includes(f.name) && !placed.has(resumes.indexOf(r)))
      .sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        const da = new Date(b.uploadedAt || 0);
        const db = new Date(a.uploadedAt || 0);
        return da - db;
      });

    if (filterResumes.length === 0) return;

    gridHtml += `<div style="display:flex;align-items:center;gap:8px;margin-top:${fi > 0 ? '12' : '0'}px;margin-bottom:4px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:700;">${fi + 1}</span>
      <span style="font-size:13px;font-weight:600;color:${color};">${f.name}</span>
      <span style="font-size:10px;color:var(--text-faint);font-family:var(--mono);">${filterResumes.length} resume${filterResumes.length > 1 ? 's' : ''}</span>
    </div>`;

    filterResumes.forEach(r => {
      gridHtml += buildResumeCard(r, sf, filterColors);
      placed.add(resumes.indexOf(r));
    });
  });

  // Unassigned resumes (no filter assigned)
  const unassignedResumes = activeResumes.filter(r => !placed.has(resumes.indexOf(r)));
  if (unassignedResumes.length > 0) {
    gridHtml += `<div style="display:flex;align-items:center;gap:8px;margin-top:${sf.length > 0 ? '12' : '0'}px;margin-bottom:4px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--border);color:var(--text-faint);font-size:11px;font-weight:700;">—</span>
      <span style="font-size:13px;font-weight:600;color:var(--text-faint);">Unassigned</span>
      <span style="font-size:10px;color:var(--text-faint);font-family:var(--mono);">${unassignedResumes.length}</span>
    </div>`;
    unassignedResumes.forEach(r => {
      gridHtml += buildResumeCard(r, sf, filterColors);
    });
  }

  grid.innerHTML = gridHtml;

  renderResumeArchive(archivedResumes);

  // Refresh readiness panel visibility
  if (typeof initReadinessPanel === 'function') initReadinessPanel();
}

function renderResumeArchive(archivedResumes) {
  const section = $('#resume-archive-section');
  const listEl = $('#resume-archive-list');
  const labelEl = $('#archive-count-label');
  if (!section) return;

  if (archivedResumes.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  labelEl.textContent = archivedResumes.length + ' archived';

  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  listEl.innerHTML = archivedResumes.map(r => {
    const i = resumes.indexOf(r);
    const meta = getPipelineMeta();
    const jobsApplied = Object.values(meta).filter(m => m.resumeUsed === r.name).length;
    const responded = Object.values(meta).filter(m => m.resumeUsed === r.name && ['responded','interview','offer'].includes(m.stage)).length;
    const rate = jobsApplied > 0 ? Math.round((responded / jobsApplied) * 100) + '%' : '—';
    const levelBadge = r.levelLabel
      ? `<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:${r.levelColor || '#94a3b8'}15;color:${r.levelColor || '#94a3b8'};">${r.levelLabel}</span>`
      : '';
    const filterBadges = (r.filterIds || []).map(fname => {
      const fi = sf.findIndex(f => f.name === fname);
      if (fi < 0) return '';
      const color = filterColors[fi % filterColors.length];
      return `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${color};color:#fff;font-size:9px;font-weight:700;" title="${fname}">${fi + 1}</span>`;
    }).filter(Boolean).join(' ') || '';

    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg-input);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);display:flex;align-items:center;gap:6px;">${filterBadges} ${r.name} ${levelBadge}</div>
        <div style="font-size:10px;color:var(--text-faint);">Uploaded ${r.uploadedAt || '—'} · Archived ${r.archivedAt || '—'}</div>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);white-space:nowrap;">${jobsApplied} apps · ${rate} rate</div>
      <button class="rc-btn rc-rename" onclick="unarchiveResume(${i})" style="background:var(--accent);">Restore</button>
      <button class="rc-btn rc-delete" onclick="removeResume(${i})">Delete</button>
    </div>`;
  }).join('');

  // G25: Render cover letter archive
  if (typeof bjRenderCoverLetterArchive === 'function') bjRenderCoverLetterArchive();
}

// Nav dot updates
function updateResumeNavDot() {
  const dot = $('#resume-status-dot');
  if (!dot) return;
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const activeResumes = resumes.filter(r => !r.archived);
  const allAssignedFilterNames = new Set(activeResumes.flatMap(r => r.filterIds || []));

  if (activeResumes.length === 0 || sf.length === 0 || allAssignedFilterNames.size === 0) {
    // Red: no resumes or no filters associated
    dot.className = 'ext-status-dot stale';
    dot.title = 'No resumes assigned to filters';
  } else if (sf.every(f => allAssignedFilterNames.has(f.name))) {
    // Green: every filter has a resume
    dot.className = 'ext-status-dot connected';
    dot.title = 'All filters have resumes assigned';
  } else {
    // Yellow: some filters without resumes
    dot.className = 'ext-status-dot warning';
    dot.title = 'Some filters missing resumes';
  }
}

function updatePipelineNavDot() {
  const dot = $('#pipeline-status-dot');
  if (!dot) return;
  const meta = getPipelineMeta();
  const entries = Object.values(meta);
  if (entries.length === 0) {
    dot.className = 'ext-status-dot';
    dot.title = 'No jobs tracked';
    return;
  }
  // Find most recent update (any stage change timestamp)
  let latestUpdate = 0;
  for (const m of entries) {
    for (const key of ['savedAt','appliedAt','respondedAt','interviewAt','offerAt','rejectedAt']) {
      if (m[key]) {
        const d = new Date(m[key]).getTime();
        if (d > latestUpdate) latestUpdate = d;
      }
    }
  }
  const now = Date.now();
  const daysSince = latestUpdate ? Math.floor((now - latestUpdate) / 86400000) : 999;
  if (daysSince <= 7) {
    dot.className = 'ext-status-dot connected';
    dot.title = `Pipeline updated ${daysSince === 0 ? 'today' : daysSince + 'd ago'}`;
  } else if (daysSince <= 14) {
    dot.className = 'ext-status-dot warning';
    dot.title = `Pipeline not updated in ${daysSince} days`;
  } else {
    dot.className = 'ext-status-dot stale';
    dot.title = `Pipeline stale — ${daysSince} days since last update`;
  }
}

window.toggleResumeFilter = function(resumeIdx, filterName) {
  const r = resumes[resumeIdx];
  if (!r.filterIds) r.filterIds = [];
  const idx = r.filterIds.indexOf(filterName);
  if (idx >= 0) {
    r.filterIds.splice(idx, 1);
  } else {
    r.filterIds.push(filterName);
  }
  // Clear readiness cache so it re-analyzes with new assignment
  readinessCache = null;
  localStorage.removeItem('bj_readiness');
  jobMatchScores = {};
  saveResumes();
  renderResumes();
};

window.setResumeLevel = function(idx, selectEl) {
  const val = selectEl.value;
  const levels = (JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || []);
  const lvl = levels.find(l => l.label === val);
  resumes[idx].levelLabel = val || '';
  resumes[idx].levelColor = lvl?.color || '#94a3b8';
  saveResumes();
  renderResumes();
};

window.archiveResume = function(idx) {
  if (!confirm(`Archive "${resumes[idx].name}"? It will be moved to the archive section.`)) return;
  resumes[idx].archived = true;
  resumes[idx].archivedAt = new Date().toLocaleDateString();
  saveResumes();
  renderResumes();
};

window.unarchiveResume = function(idx) {
  resumes[idx].archived = false;
  delete resumes[idx].archivedAt;
  saveResumes();
  renderResumes();
};

// ============================================================
// RESUME TEXT EXTRACTION (P4)
// ============================================================
async function extractTextFromPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText.trim();
  } catch (e) {
    console.error('[BJ] PDF text extraction failed:', e);
    return '';
  }
}

async function extractTextFromDOCX(fileOrBuffer) {
  try {
    if (typeof mammoth === 'undefined') {
      console.error('[BJ] mammoth.js not loaded');
      return '';
    }
    let arrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer.arrayBuffer) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
      return '';
    }
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value || '').trim();
  } catch (e) {
    console.error('[BJ] DOCX text extraction failed:', e);
    return '';
  }
}

async function extractTextFromFile(file) {
  if (/\.pdf$/i.test(file.name)) {
    return await extractTextFromPDF(file);
  }
  if (/\.docx$/i.test(file.name)) {
    return await extractTextFromDOCX(file);
  }
  // Plain text fallback (.txt, .md, etc.)
  try {
    const text = await file.text();
    // Binary file detection — skip if it looks like a zip or binary
    if (text.startsWith('PK') || text.charCodeAt(0) > 127) return '';
    return text.trim();
  } catch (e) {
    return '';
  }
}

// Auto re-extract resumes stuck at "no-text" — runs on page load
async function reExtractStuckResumes() {
  let changed = false;

  // Clean up stale filterIds that reference deleted/renamed filters
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const validFilterNames = new Set(sf.map(f => f.name));
  for (let i = 0; i < resumes.length; i++) {
    if (!resumes[i].filterIds) continue;
    const before = resumes[i].filterIds.length;
    resumes[i].filterIds = resumes[i].filterIds.filter(fn => validFilterNames.has(fn));
    if (resumes[i].filterIds.length !== before) {
      changed = true;
      console.log('[BJ] Cleaned stale filterIds for', resumes[i].name, ': removed', before - resumes[i].filterIds.length, 'orphaned');
    }
  }

  for (let i = 0; i < resumes.length; i++) {
    const r = resumes[i];
    if (r.archived || r.textStatus !== 'no-text' || !r.id) continue;
    if (!r.fileName || !/\.docx$/i.test(r.fileName)) continue;

    console.log('[BJ] Re-extracting stuck resume:', r.name);
    try {
      const blob = await bjFileStore.get(r.id);
      if (!blob) { console.log('[BJ] No file in IndexedDB for', r.id); continue; }

      const arrayBuffer = await blob.arrayBuffer();
      const text = await extractTextFromDOCX(arrayBuffer);
      if (text && text.length > 50) {
        resumes[i].extractedText = text;
        resumes[i].keywords = extractResumeKeywords(text);
        resumes[i].textStatus = 'ready';
        changed = true;
        console.log('[BJ] Re-extracted:', r.name, '→', text.length, 'chars,', resumes[i].keywords.length, 'keywords');
      } else {
        console.log('[BJ] Re-extraction got no text for', r.name);
      }
    } catch (e) {
      console.error('[BJ] Re-extraction error for', r.name, e);
    }
  }
  if (changed) {
    saveResumes();
    renderResumes();
  }
}

function extractResumeKeywords(text) {
  if (!text || text.length < 50) return [];
  const words = tokenize(text);
  const counts = {};
  for (const w of words) {
    if (!KW_STOPWORDS.has(w) && !KW_GENERIC.has(w) && w.length > 2) {
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  return Object.entries(counts).filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

async function addResume(file) {
  // Check entitlement — count only active (non-archived) resumes
  var activeCount = resumes.filter(function(r) { return !r.archived; }).length;
  var ent = await checkEntitlement('resumes', activeCount);
  if (!ent.allowed) { showUpgradePrompt('Resume Uploads', ent); return; }

  const id = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const sizeStr = file.size < 1024 * 1024
    ? (file.size / 1024).toFixed(0) + ' KB'
    : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
  const resume = {
    id,
    name: file.name.replace(/\.(pdf|docx?|doc)$/i, ''),
    fileName: file.name,
    size: sizeStr,
    filterIds: [],
    uploadedAt: new Date().toLocaleDateString(),
    levelLabel: '',
    levelColor: '',
    archived: false,
    extractedText: '',
    keywords: [],
    textStatus: 'extracting'
  };
  resumes.push(resume);
  saveResumes();
  clearEntitlementCache('resumes');
  renderResumes();
  // Store file blob in IndexedDB for downloads
  bjFileStore.put(id, file).catch(e => console.warn('[BJ] File store error:', e));

  extractTextFromFile(file).then(text => {
    const idx = resumes.findIndex(r => r.id === id);
    if (idx < 0) return;
    resumes[idx].extractedText = text;
    resumes[idx].keywords = extractResumeKeywords(text);
    resumes[idx].textStatus = text ? 'ready' : 'no-text';
    saveResumes();
    renderResumes();
  });
}

window.toggleResumeKeywords = function(idx) {
  const el = document.getElementById(`rc-kw-${idx}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

window.renameResume = function(idx) {
  const current = resumes[idx].name;
  const input = prompt('Resume name:', current);
  if (input === null || !input.trim()) return;
  resumes[idx].name = input.trim();
  saveResumes();
  renderResumes();
};

window.removeResume = function(idx) {
  if (!confirm(`Permanently delete "${resumes[idx].name}"?`)) return;
  // Clean up stored file
  bjFileStore.delete(resumes[idx].id).catch(() => {});
  resumes.splice(idx, 1);
  saveResumes();
  renderResumes();
};

// IndexedDB file store for resume downloads
const bjFileStore = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('bj_resume_files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async put(id, file) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

window.downloadResume = async function(idx) {
  const r = resumes[idx];
  if (!r) return;
  try {
    const file = await bjFileStore.get(r.id);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || (r.name + '.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert('File data not available. Re-upload this resume to enable downloads.');
    }
  } catch(e) {
    alert('Download failed: ' + e.message);
  }
};

window.replaceResumePlaceholder = function(idx) {
  const tmpInput = document.createElement('input');
  tmpInput.type = 'file';
  tmpInput.accept = '.pdf,.doc,.docx';
  tmpInput.addEventListener('change', () => {
    const file = tmpInput.files[0];
    if (!file) return;
    const sizeStr = file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(0) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    resumes[idx].fileName = file.name;
    resumes[idx].size = sizeStr;
    resumes[idx].needsUpload = false;
    resumes[idx].source = 'upload';
    resumes[idx].textStatus = 'extracting';
    saveResumes();
    renderResumes();

    extractTextFromFile(file).then(text => {
      if (!resumes[idx]) return;
      resumes[idx].extractedText = text;
      resumes[idx].keywords = extractResumeKeywords(text);
      resumes[idx].textStatus = text ? 'ready' : 'no-text';
      saveResumes();
      renderResumes();
    });
  });
  tmpInput.click();
};

// Re-upload file for existing resume (when IndexedDB file is missing)
window.reUploadResume = function(idx) {
  const tmpInput = document.createElement('input');
  tmpInput.type = 'file';
  tmpInput.accept = '.pdf,.doc,.docx';
  tmpInput.addEventListener('change', () => {
    const file = tmpInput.files[0];
    if (!file) return;
    const sizeStr = file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(0) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    resumes[idx].fileName = file.name;
    resumes[idx].size = sizeStr;
    resumes[idx].source = 'upload';
    resumes[idx].textStatus = 'extracting';
    // Clear stale readiness cache
    readinessCache = null;
    localStorage.removeItem('bj_readiness');
    jobMatchScores = {};
    saveResumes();
    renderResumes();

    // Store file blob in IndexedDB
    bjFileStore.put(resumes[idx].id, file).catch(e => console.warn('[BJ] File store error:', e));

    extractTextFromFile(file).then(text => {
      if (!resumes[idx]) return;
      resumes[idx].extractedText = text;
      resumes[idx].keywords = extractResumeKeywords(text);
      resumes[idx].textStatus = text ? 'ready' : 'no-text';
      saveResumes();
      renderResumes();
      if (text) {
        console.log('[BJ] Re-upload extraction:', resumes[idx].name, '→', text.length, 'chars,', resumes[idx].keywords.length, 'keywords');
      }
    });
  });
  tmpInput.click();
};

// Resume file input handler
function handleResumeFileInput() {
  var inp = $('#resume-file-input');
  if (inp && inp.files) {
    Array.from(inp.files).forEach(f => addResume(f));
    inp.value = '';
  }
}

const resumeInput = $('#resume-file-input');
const resumeZone = $('#resume-upload-zone');
if (resumeZone) {
  resumeZone.addEventListener('click', () => resumeInput.click());
  resumeZone.addEventListener('dragover', e => { e.preventDefault(); resumeZone.style.borderColor = 'var(--accent)'; });
  resumeZone.addEventListener('dragleave', () => { resumeZone.style.borderColor = ''; });
  resumeZone.addEventListener('drop', e => {
    e.preventDefault();
    resumeZone.style.borderColor = '';
    Array.from(e.dataTransfer.files).forEach(f => addResume(f));
  });
}
if (resumeInput) {
  resumeInput.addEventListener('change', handleResumeFileInput);
}

renderResumes();

// Create by Level — scaffold resume placeholders for each level in the hierarchy
$('#resume-from-level-btn')?.addEventListener('click', async () => {
  const levels = JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || [];
  if (levels.length === 0) {
    alert('No title levels configured. Go to Search Tuning → Title Level Hierarchy to set up your levels first.');
    return;
  }

  const existingNames = resumes.filter(r => !r.archived).map(r => r.name.toLowerCase());
  const newLevels = levels.filter(l => l.label && !existingNames.includes(l.label.toLowerCase() + ' resume'));

  if (newLevels.length === 0) {
    alert('You already have resume placeholders for all configured levels.');
    return;
  }

  // Check entitlement for total resumes after adding
  var activeCount = resumes.filter(r => !r.archived).length;
  var ent = await checkEntitlement('resumes', activeCount + newLevels.length - 1);
  if (!ent.allowed) { showUpgradePrompt('Resume Uploads', ent); return; }

  if (!confirm(`Create ${newLevels.length} resume placeholder${newLevels.length > 1 ? 's' : ''} for:\n\n${newLevels.map((l, i) => `${i+1}. ${l.label}`).join('\n')}\n\nUpload the actual files to each card after.`)) return;

  newLevels.forEach((lvl, i) => {
    resumes.push({
      id: 'res_lvl_' + Date.now() + '_' + i,
      name: lvl.label + ' Resume',
      fileName: 'Upload your ' + lvl.label.toLowerCase() + '-level resume',
      size: '—',
      filterIds: [],
      uploadedAt: new Date().toLocaleDateString(),
      source: 'level-placeholder',
      levelLabel: lvl.label,
      levelColor: lvl.color || '#94a3b8',
      needsUpload: true,
      archived: false,
    });
  });
  saveResumes();
  renderResumes();
});

// Init nav dots
setTimeout(() => { updatePipelineNavDot(); }, 1200);

// Auto re-extract DOCX resumes stuck at "no-text" once mammoth.js is loaded
setTimeout(() => {
  if (typeof mammoth !== 'undefined') {
    reExtractStuckResumes();
  } else {
    // Wait for mammoth to load
    const waitForMammoth = setInterval(() => {
      if (typeof mammoth !== 'undefined') {
        clearInterval(waitForMammoth);
        reExtractStuckResumes();
      }
    }, 500);
    setTimeout(() => clearInterval(waitForMammoth), 10000); // Give up after 10s
  }
}, 1500);

// === js/integrations.js ===
// ============================================================
// GOOGLE DRIVE INTEGRATION
// ============================================================
let gdriveState = JSON.parse(localStorage.getItem('bj_gdrive') || '{"connected":false,"files":[]}');

function renderGdriveState() {
  const dot = $('#gdrive-dot');
  const statusText = $('#gdrive-status-text');
  const connectBtn = $('#gdrive-connect-btn');
  const disconnectBtn = $('#gdrive-disconnect-btn');
  const filesSection = $('#gdrive-files');
  const fileList = $('#gdrive-file-list');

  if (gdriveState.connected) {
    dot.className = 'setup-dot connected';
    statusText.textContent = `Connected as ${gdriveState.email || 'Google Account'}`;
    statusText.style.color = 'var(--green)';
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = '';
    filesSection.style.display = '';

    if (gdriveState.files.length === 0) {
      fileList.innerHTML = '<div style="font-size:12px;color:var(--text-faint);padding:8px 0;">No files linked yet. Click below to link a Google Doc as a resume.</div>';
    } else {
      fileList.innerHTML = gdriveState.files.map((f, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.08);">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
            <div style="font-size:10px;color:var(--text-faint);">Linked ${f.linkedAt || ''}</div>
          </div>
          <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;color:var(--accent);background:none;border:1px solid var(--accent);" onclick="importGdriveAsResume(${i})">Import as Resume</button>
          <button style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;padding:2px 4px;" onclick="unlinkGdriveFile(${i})" title="Unlink">✕</button>
        </div>
      `).join('');
    }
  } else {
    dot.className = 'setup-dot';
    statusText.textContent = 'Not connected';
    statusText.style.color = 'var(--text-dim)';
    connectBtn.style.display = '';
    disconnectBtn.style.display = 'none';
    filesSection.style.display = 'none';
  }
}

window.connectGoogleDrive = function() {
  // TODO: Replace with real Google OAuth flow via Supabase Auth
  const email = prompt('Enter your Google account email to connect:');
  if (!email || !email.includes('@')) return;
  gdriveState.connected = true;
  gdriveState.email = email;
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.disconnectGoogleDrive = function() {
  if (!confirm('Disconnect Google Drive? Linked files will be removed.')) return;
  gdriveState = { connected: false, files: [] };
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.addGdriveFile = function() {
  // TODO: Replace with Google Picker API
  const name = prompt('Google Doc name (or paste a Google Docs URL):');
  if (!name || !name.trim()) return;
  const displayName = name.includes('docs.google.com')
    ? name.split('/').pop() || 'Google Doc'
    : name.trim();
  gdriveState.files.push({
    name: displayName,
    url: name.includes('docs.google.com') ? name : null,
    linkedAt: new Date().toLocaleDateString(),
    id: 'gd_' + Date.now()
  });
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.unlinkGdriveFile = function(idx) {
  gdriveState.files.splice(idx, 1);
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.importGdriveAsResume = function(idx) {
  const f = gdriveState.files[idx];
  const resume = {
    id: 'res_gd_' + Date.now(),
    name: f.name.replace(/\.(gdoc|pdf|docx?)$/i, ''),
    fileName: f.name,
    size: 'Google Doc',
    filterIds: [],
    uploadedAt: new Date().toLocaleDateString(),
    source: 'gdrive',
    archived: false,
    levelLabel: '',
    gdriveUrl: f.url,
    gdriveId: f.id
  };
  resumes.push(resume);
  saveResumes();
  renderResumes();
  alert(`"${f.name}" imported as a resume. Go to the Resumes page to assign it to filters.`);
};

renderGdriveState();



// === js/applications.js ===
// ============================================================
// APPLICATIONS — Flow Management
// ============================================================
let appQueue = JSON.parse(localStorage.getItem('bj_app_queue') || '[]');
let appHistory = JSON.parse(localStorage.getItem('bj_app_history') || '[]');
let appMode = localStorage.getItem('bj_app_mode') || 'manual';

// Tab switching
$$('.app-flow-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.app-flow-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.app-flow-panel').forEach(p => p.classList.remove('active'));
    $(`#panel-${tab.dataset.panel}`).classList.add('active');
  });
});

// Mode selection
$$('.app-mode-select').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.app-mode-select').forEach(b => {
      b.classList.remove('active');
      b.className = b.className.replace(/btn-primary/g, 'btn-secondary');
      b.style.border = '';
    });
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    appMode = btn.dataset.mode;
    localStorage.setItem('bj_app_mode', appMode);
  });
});

// Set active mode on load
$$('.app-mode-select').forEach(btn => {
  if (btn.dataset.mode === appMode) {
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
  } else {
    btn.classList.remove('active');
    btn.className = btn.className.replace(/btn-primary/g, 'btn-secondary');
    btn.style.border = '';
  }
});

function modeBadge(mode) {
  const map = { manual: 'mode-manual', auto: 'mode-auto', notify: 'mode-notify' };
  const labels = { manual: 'Manual', auto: 'Auto', notify: 'Notify' };
  return `<span class="app-mode-badge ${map[mode] || 'mode-manual'}">${labels[mode] || mode}</span>`;
}

function statusBadge(status) {
  const map = { queued: 'status-queued', pending: 'status-pending', sent: 'status-sent', submitted: 'status-submitted', failed: 'status-failed' };
  const labels = { queued: 'Queued', pending: 'Pending Approval', sent: 'Notification Sent', submitted: 'Submitted', failed: 'Failed' };
  return `<span class="app-status-badge ${map[status] || 'status-queued'}">${labels[status] || status}</span>`;
}

function renderAppQueue() {
  const tbody = $('#app-queue-body');
  const navBadge = $('#nav-app-count');

  // Update stat cards
  const queued = appQueue.filter(a => a.status === 'queued').length;
  const pending = appQueue.filter(a => a.status === 'pending' || a.status === 'sent').length;
  const submitted = [...appQueue, ...appHistory].filter(a => a.status === 'submitted').length;
  const failed = [...appQueue, ...appHistory].filter(a => a.status === 'failed').length;
  $('#a-queued').textContent = queued;
  $('#a-pending').textContent = pending;
  $('#a-submitted').textContent = submitted;
  $('#a-failed').textContent = failed;

  if (navBadge && appQueue.length > 0) {
    navBadge.style.display = '';
    navBadge.textContent = appQueue.length;
  }

  // Enable process button if items exist
  const processBtn = $('#a-process-queue');
  processBtn.disabled = appQueue.filter(a => a.status === 'queued').length === 0;

  if (appQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No applications queued</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">
        Add jobs manually, or save jobs from Discovery to auto-queue them based on your rules.
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = appQueue.map((app, i) => `
    <tr>
      <td><input type="checkbox" class="a-row-check" data-idx="${i}"></td>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.addedAt}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="removeFromQueue(${i})" style="padding:4px 8px;font-size:11px;color:var(--red);">✕</button>
      </td>
    </tr>
  `).join('');
}

function renderAppHistory() {
  const tbody = $('#app-history-body');
  if (appHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No application history yet</div>
      <div style="font-size:12px;">Completed applications will appear here with full audit trail.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = appHistory.map(app => `
    <tr>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.submittedAt || '—'}</td>
      <td style="font-size:12px;">${app.source || '—'}</td>
    </tr>
  `).join('');
}

// Manual add to queue
$('#a-add-manual').addEventListener('click', () => {
  const title = prompt('Job title:');
  if (!title) return;
  const company = prompt('Company:');
  if (!company) return;
  const url = prompt('Application URL (optional):') || '';

  const firstResume = resumes.find(r => !r.archived && !r.needsUpload);
  appQueue.push({
    id: 'app_' + Date.now(),
    jobTitle: title,
    company: company,
    url: url,
    resumeName: firstResume ? firstResume.name : '',
    resumeId: firstResume ? firstResume.id : '',
    mode: appMode,
    status: appMode === 'auto' ? 'queued' : (appMode === 'notify' ? 'pending' : 'queued'),
    addedAt: new Date().toLocaleDateString(),
    source: 'manual'
  });
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
});

// Process queue — simulate sending notifications or submitting
$('#a-process-queue').addEventListener('click', () => {
  let processed = 0;
  appQueue.forEach(app => {
    if (app.status !== 'queued') return;
    if (app.mode === 'auto') {
      app.status = 'submitted';
      app.submittedAt = new Date().toLocaleDateString();
      processed++;
    } else if (app.mode === 'notify') {
      app.status = 'sent';
      processed++;
    } else {
      // Manual — mark as pending user action
      app.status = 'pending';
      processed++;
    }
  });

  // Move submitted ones to history
  const submitted = appQueue.filter(a => a.status === 'submitted');
  appHistory.push(...submitted);
  appQueue = appQueue.filter(a => a.status !== 'submitted');

  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  saveUserData('bj_app_history', JSON.stringify(appHistory));
  renderAppQueue();
  renderAppHistory();

  if (processed > 0) {
    alert(`Processed ${processed} application(s).\n\n` +
      (submitted.length > 0 ? `${submitted.length} auto-submitted.\n` : '') +
      (appQueue.filter(a => a.status === 'sent').length > 0 ? `Notifications sent — awaiting your approval.\n` : '') +
      (appQueue.filter(a => a.status === 'pending').length > 0 ? `Manual applications ready for you to review.` : '')
    );
  }
});

// Remove from queue
window.removeFromQueue = function(idx) {
  appQueue.splice(idx, 1);
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
};

// Select all checkbox
$('#a-select-all')?.addEventListener('change', e => {
  $$('.a-row-check').forEach(cb => cb.checked = e.target.checked);
});

// Set notification email from user
if (currentUser?.email) {
  const emailInput = $('#notify-email-addr');
  if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
}

renderAppQueue();
renderAppHistory();

// Gmail
$('#gmail-connect-btn').addEventListener('click', () => {
  alert('Gmail integration coming soon.\n\nThis will use Gmail OAuth to auto-detect responses from companies you\'ve applied to.');
});

// ============================================================
// NOTIFICATION SYSTEM — Preferences, Phone, Escalation, Overrides, Log
// ============================================================

// ---- Notification type catalog (matches NOTIFICATION_SPEC.md) ----
const NOTIF_TYPES = [
  { id: 'auto_apply_confirm', label: 'Auto-apply confirmations', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'apply_alert', label: 'Apply-on-notification alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'pipeline_response', label: 'Pipeline changes', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_interview', label: 'Interview / Offer alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'listing_closed', label: 'Listing closed', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_stale', label: 'Stale application reminders', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'new_jobs_daily', label: 'New job matches', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'company_hiring_surge', label: 'Company hiring surge', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'ghost_alert', label: 'Ghost alerts', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'salary_change', label: 'Salary range changes', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'connections_at_company', label: 'Network match alerts', tier: 'network', defaultFreq: 'realtime', smsDefault: true },
  { id: 'weekly_summary', label: 'Weekly summary', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'market_stats', label: 'Market stats digest', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'ghost_report', label: 'Ghost report', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
];

let notifPrefs = null;   // notification_preferences row
let notifChannels = {};  // notification_channels keyed by notification_type
let phoneVerified = false;

// ---- Load notification preferences from Supabase ----
async function loadNotifPrefs() {
  if (!currentUser) return;
  try {
    // Global prefs — upsert defaults if row doesn't exist yet
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    const { data: prefs } = await sb.from('notification_preferences')
      .select('*').eq('user_id', currentUser.id).single();
    notifPrefs = prefs;

    // Per-type channels
    const { data: channels } = await sb.from('notification_channels')
      .select('*').eq('user_id', currentUser.id);
    notifChannels = {};
    (channels || []).forEach(c => { notifChannels[c.notification_type] = c; });

    // Apply to UI
    phoneVerified = prefs?.phone_verified || false;
    applyPrefsToUI();
    applyPhoneUI();
    applyEscalationUI();
  } catch (e) {
    console.warn('[Notif] Failed to load preferences:', e);
  }
}

function applyPrefsToUI() {
  // Update matrix toggles from loaded channel data
  $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
    const type = row.dataset.notif;
    const ch = notifChannels[type];
    const emailToggle = row.querySelector('.nch-email');
    const smsToggle = row.querySelector('.nch-sms');
    const freqSelect = row.querySelector('.nch-freq');

    if (emailToggle && ch) emailToggle.checked = ch.email !== false;
    if (smsToggle) {
      const smsSwitch = smsToggle.closest('.toggle-switch');
      if (phoneVerified) {
        smsSwitch.classList.remove('disabled');
        smsSwitch.title = '';
        smsToggle.disabled = false;
        if (ch) smsToggle.checked = ch.sms === true;
      } else {
        smsSwitch.classList.add('disabled');
        smsSwitch.title = 'Verify phone to enable SMS';
        smsToggle.disabled = true;
        smsToggle.checked = false;
      }
    }
    if (freqSelect && ch?.frequency) freqSelect.value = ch.frequency;
  });
}

function applyPhoneUI() {
  if (phoneVerified && notifPrefs?.phone_number) {
    $('#phone-setup-unverified').style.display = 'none';
    $('#phone-setup-verified').style.display = '';
    $('#verified-phone-display').textContent = notifPrefs.phone_number;
  } else {
    $('#phone-setup-unverified').style.display = '';
    $('#phone-setup-verified').style.display = 'none';
  }
}

function applyEscalationUI() {
  if (!notifPrefs) return;
  const slider = $('#esc-timeout-slider');
  if (slider && notifPrefs.escalation_timeout_hours) {
    slider.value = notifPrefs.escalation_timeout_hours;
    $('#esc-timeout-val').textContent = notifPrefs.escalation_timeout_hours + ' hours';
    $('#esc-hours-label').textContent = notifPrefs.escalation_timeout_hours;
  }
  if (notifPrefs.quiet_start) $('#quiet-start').value = notifPrefs.quiet_start.slice(0, 5);
  if (notifPrefs.quiet_end) $('#quiet-end').value = notifPrefs.quiet_end.slice(0, 5);
  if (notifPrefs.timezone) $('#notif-timezone').value = notifPrefs.timezone;
}

// ---- Save notification preferences ----
$('#notif-save-prefs')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-prefs');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Upsert global prefs
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      email_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    // Upsert per-type channels
    const rows = [];
    $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
      const type = row.dataset.notif;
      const emailOn = row.querySelector('.nch-email')?.checked ?? true;
      const smsOn = row.querySelector('.nch-sms')?.checked ?? false;
      const freqEl = row.querySelector('.nch-freq');
      const freq = freqEl ? freqEl.value : NOTIF_TYPES.find(n => n.id === type)?.defaultFreq || 'realtime';
      rows.push({
        user_id: currentUser.id,
        notification_type: type,
        email: emailOn,
        sms: smsOn,
        frequency: freq
      });
    });
    if (rows.length > 0) {
      await sb.from('notification_channels').upsert(rows, { onConflict: 'user_id,notification_type' });
    }

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Preferences'; btn.disabled = false; }, 1500);
  } catch (e) {
    console.error('[Notif] Save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// ---- Phone Verification ----
let pendingPhone = '';

$('#phone-send-otp')?.addEventListener('click', async () => {
  const country = $('#phone-country').value;
  const number = $('#phone-number').value.replace(/\D/g, '');
  if (!number || number.length < 7) {
    alert('Please enter a valid phone number.');
    return;
  }
  pendingPhone = country + number;
  const btn = $('#phone-send-otp');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const { error } = await sb.auth.signInWithOtp({ phone: pendingPhone });
    if (error) throw error;
    $('#otp-row').style.display = '';
    $('#otp-status').textContent = 'Code sent. Check your phone.';
    $('#otp-status').style.color = 'var(--green)';
    btn.textContent = 'Resend Code';
    btn.disabled = false;
  } catch (e) {
    console.error('[Phone] OTP send failed:', e);
    $('#otp-status').textContent = 'Failed to send code: ' + (e.message || e);
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Send Verification Code';
    btn.disabled = false;
  }
});

$('#phone-verify-otp')?.addEventListener('click', async () => {
  const code = $('#otp-code').value.trim();
  if (!code || code.length !== 6) {
    $('#otp-status').textContent = 'Enter the 6-digit code.';
    $('#otp-status').style.color = 'var(--warm)';
    return;
  }
  const btn = $('#phone-verify-otp');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const { data, error } = await sb.auth.verifyOtp({
      phone: pendingPhone,
      token: code,
      type: 'sms'
    });
    if (error) throw error;

    // Update notification_preferences with verified phone
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      phone_number: pendingPhone,
      phone_verified: true,
      sms_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    phoneVerified = true;
    if (notifPrefs) {
      notifPrefs.phone_number = pendingPhone;
      notifPrefs.phone_verified = true;
    }
    applyPhoneUI();
    applyPrefsToUI(); // unlock SMS toggles

    btn.textContent = 'Verify';
    btn.disabled = false;
  } catch (e) {
    console.error('[Phone] Verify failed:', e);
    $('#otp-status').textContent = 'Invalid code. Try again.';
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Verify';
    btn.disabled = false;
  }
});

$('#phone-change')?.addEventListener('click', () => {
  phoneVerified = false;
  applyPhoneUI();
  $('#phone-number').value = '';
  $('#otp-row').style.display = 'none';
  $('#otp-code').value = '';
  $('#otp-status').textContent = '';
});

// ---- Escalation Rules ----
$('#esc-timeout-slider')?.addEventListener('input', e => {
  const val = e.target.value;
  $('#esc-timeout-val').textContent = val + ' hour' + (val === '1' ? '' : 's');
  $('#esc-hours-label').textContent = val;
});

$('#notif-save-escalation')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-escalation');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      escalation_timeout_hours: parseInt($('#esc-timeout-slider').value),
      quiet_start: $('#quiet-start').value + ':00',
      quiet_end: $('#quiet-end').value + ':00',
      timezone: $('#notif-timezone').value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Escalation Rules'; btn.disabled = false; }, 1500);
  } catch (e) {
    console.error('[Notif] Escalation save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// Populate timezone dropdown
(function populateTimezones() {
  const sel = $('#notif-timezone');
  if (!sel) return;
  const zones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
    'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Melbourne',
    'Pacific/Auckland'
  ];
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected && !zones.includes(detected)) zones.unshift(detected);

  sel.innerHTML = zones.map(tz =>
    `<option value="${tz}" ${tz === detected ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`
  ).join('');
})();

// ---- Filter-Specific Overrides ----
function populateOverrideFilterSelect() {
  const sel = $('#override-filter-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a saved filter...</option>';
  savedFilters.forEach(f => {
    sel.innerHTML += `<option value="${f.name}">${f.name}</option>`;
  });
}
populateOverrideFilterSelect();

$('#override-filter-select')?.addEventListener('change', async (e) => {
  const filterName = e.target.value;
  if (!filterName) {
    $('#override-matrix-wrap').style.display = 'none';
    $('#override-empty').style.display = '';
    return;
  }
  $('#override-empty').style.display = 'none';
  $('#override-matrix-wrap').style.display = '';
  $('#override-filter-name').textContent = filterName;

  // Load existing overrides for this filter
  let overrides = {};
  if (currentUser) {
    try {
      const { data } = await sb.from('notification_filter_overrides')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('filter_name', filterName);
      (data || []).forEach(o => { overrides[o.notification_type] = o; });
    } catch (e) { /* ignore */ }
  }

  // Build override matrix rows
  const tbody = $('#override-matrix-body');
  tbody.innerHTML = NOTIF_TYPES.map(nt => {
    const ov = overrides[nt.id];
    const emailChecked = ov ? ov.email : true;
    const smsChecked = ov ? ov.sms : nt.smsDefault;
    const freq = ov?.frequency || nt.defaultFreq;
    const smsDisabled = !phoneVerified ? 'disabled' : '';
    const smsClass = !phoneVerified ? 'disabled' : '';
    const freqHtml = nt.tier === 'realtime' || nt.tier === 'weekly'
      ? `<span style="font-size:12px;color:var(--text-faint);">${nt.tier === 'realtime' ? 'Real-time' : 'Weekly'}</span>`
      : `<select class="freq-select ov-freq" data-type="${nt.id}">
          <option value="realtime" ${freq==='realtime'?'selected':''}>Real-time</option>
          <option value="daily" ${freq==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${freq==='weekly'?'selected':''}>Weekly</option>
        </select>`;

    return `<tr data-ov-type="${nt.id}">
      <td>${nt.label}</td>
      <td><label class="toggle-switch"><input type="checkbox" class="ov-email" ${emailChecked?'checked':''}><span class="toggle-slider"></span></label></td>
      <td><label class="toggle-switch ${smsClass}"><input type="checkbox" class="ov-sms" ${smsChecked?'checked':''} ${smsDisabled}><span class="toggle-slider"></span></label></td>
      <td>${freqHtml}</td>
    </tr>`;
  }).join('');
});

$('#override-save')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  const btn = $('#override-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const rows = [];
    $$('#override-matrix-body tr[data-ov-type]').forEach(row => {
      const type = row.dataset.ovType;
      rows.push({
        user_id: currentUser.id,
        filter_name: filterName,
        notification_type: type,
        email: row.querySelector('.ov-email')?.checked ?? true,
        sms: row.querySelector('.ov-sms')?.checked ?? false,
        frequency: row.querySelector('.ov-freq')?.value || null
      });
    });
    await sb.from('notification_filter_overrides').upsert(rows, {
      onConflict: 'user_id,filter_name,notification_type'
    });
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Overrides'; btn.disabled = false; }, 1500);
  } catch (e) {
    console.error('[Notif] Override save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

$('#override-clear')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  if (!confirm(`Clear all notification overrides for "${filterName}"?`)) return;

  try {
    await sb.from('notification_filter_overrides')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('filter_name', filterName);
    // Re-trigger the dropdown to reload fresh
    $('#override-filter-select').dispatchEvent(new Event('change'));
  } catch (e) { console.error('[Notif] Override clear failed:', e); }
});

// ---- Notification Log ----
let notifLogPage = 0;
const NLOG_PER_PAGE = 20;

const NOTIF_TYPE_LABELS = {};
NOTIF_TYPES.forEach(n => { NOTIF_TYPE_LABELS[n.id] = n.label; });

function notifStatusBadge(status) {
  const map = {
    sent: 'ns-sent', delivered: 'ns-delivered', opened: 'ns-opened',
    clicked: 'ns-opened', applied: 'ns-applied', passed: 'ns-passed',
    missed: 'ns-missed', expired: 'ns-expired', failed: 'ns-failed'
  };
  const labels = {
    sent: 'Sent', delivered: 'Delivered', opened: 'Opened',
    clicked: 'Clicked', applied: 'Applied', passed: 'Passed',
    missed: 'Missed', expired: 'Expired', failed: 'Failed'
  };
  return `<span class="notif-status-badge ${map[status] || 'ns-sent'}">${labels[status] || status}</span>`;
}

function channelIcon(ch) {
  if (ch === 'sms') return `<span class="notif-channel-icon" title="SMS"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>`;
  return `<span class="notif-channel-icon" title="Email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>`;
}

async function loadNotifLog() {
  if (!currentUser) return;
  const tbody = $('#notif-log-body');
  const typeFilter = $('#nlog-filter-type')?.value || '';
  const channelFilter = $('#nlog-filter-channel')?.value || '';
  const statusFilter = $('#nlog-filter-status')?.value || '';

  try {
    let query = sb.from('notification_log')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .range(notifLogPage * NLOG_PER_PAGE, (notifLogPage + 1) * NLOG_PER_PAGE - 1);

    if (typeFilter) query = query.eq('notification_type', typeFilter);
    if (channelFilter) query = query.eq('channel', channelFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data: logs, error } = await query;
    if (error) throw error;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
        <div style="margin-bottom:12px;color:var(--text-faint);"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
        <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No notifications found</div>
        <div style="font-size:12px;">Notification history will appear here once the system is active.</div>
      </td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(log => {
      const ts = new Date(log.created_at);
      const timeStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const jobInfo = [log.job_title, log.company_name].filter(Boolean).join(' at ') || '—';
      return `<tr>
        <td style="font-size:12px;color:var(--text-faint);white-space:nowrap;">${timeStr}</td>
        <td style="font-size:12px;">${NOTIF_TYPE_LABELS[log.notification_type] || log.notification_type}</td>
        <td>${channelIcon(log.channel)}</td>
        <td style="font-size:12px;">${jobInfo}</td>
        <td>${notifStatusBadge(log.status)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.warn('[Notif] Log load failed:', e);
  }
}

// Log filters
$$('#nlog-filter-type, #nlog-filter-channel, #nlog-filter-status').forEach(el => {
  el?.addEventListener('change', () => { notifLogPage = 0; loadNotifLog(); });
});

// CSV export
$('#notif-export-csv')?.addEventListener('click', async () => {
  if (!currentUser) return;
  try {
    const { data: logs } = await sb.from('notification_log')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!logs || logs.length === 0) { alert('No notifications to export.'); return; }

    const header = 'Timestamp,Type,Channel,Job,Company,Status,Subject\n';
    const rows = logs.map(l =>
      `"${l.created_at}","${l.notification_type}","${l.channel}","${l.job_id || ''}","${l.company_name || ''}","${l.status}","${(l.subject || '').replace(/"/g, '""')}"`
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brilliant-jobs-notifications-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) { console.error('[Notif] CSV export failed:', e); }
});

// ---- Pulsing Nav Dots ----
async function checkNavPulses() {
  if (!currentUser) return;
  try {
    // Get last_seen_at
    const { data: profile } = await sb.from('profiles')
      .select('last_seen_at')
      .eq('id', currentUser.id).single();
    const lastSeen = profile?.last_seen_at || new Date(0).toISOString();

    // Applications: pending notification actions
    const { count: pendingActions } = await sb
      .from('notification_actions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('status', 'pending');

    const appDot = document.querySelector('[data-page="applications"] .ext-status-dot');
    if (pendingActions > 0 && appDot) {
      appDot.classList.add('pulse');
    }

    // Jobs: new since last feed view (not last page load — cron adds jobs constantly)
    const lastFeedView = localStorage.getItem('bj_last_feed_view') || new Date(0).toISOString();
    const { count: newJobs } = await sb
      .from('ats_jobs')
      .select('*', { count: 'exact', head: true })
      .gt('first_seen_at', lastFeedView)
      .eq('status', 'open');

    if (newJobs > 25) {
      const jobsDot = document.querySelector('[data-page="jobs"] .ext-status-dot');
      if (jobsDot) jobsDot.classList.add('pulse');
    }

    // Update last_seen_at
    await sb.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', currentUser.id);
  } catch (e) {
    console.warn('[Pulse] Check failed:', e);
  }
}

// Clear pulse when navigating to a page
const _origNavClick = true;
$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const dot = item.querySelector('.ext-status-dot');
    if (dot) dot.classList.remove('pulse');
  });
});

// ---- Init notification system ----
async function initNotifications() {
  await loadNotifPrefs();
  await loadNotifLog();
  await checkNavPulses();
}
if (currentUser) {
  initNotifications();
} else {
  // Retry once auth completes (app.js init is async)
  const _waitAuth = setInterval(() => {
    if (currentUser) {
      clearInterval(_waitAuth);
      initNotifications();
    }
  }, 500);
  setTimeout(() => clearInterval(_waitAuth), 10000); // give up after 10s
}



// === js/settings.js ===
// Stats — now powered by stats.js (ECharts dashboard)
function loadStats() {
  // Lazy-init: stats.js handles everything via initStatsPage()
  // Called on app init and when navigating to Stats tab
  if (typeof initStatsPage === 'function') {
    initStatsPage();
  }
}

// Account (Settings page)
$('#st-change-pw')?.addEventListener('click', async () => {
  try {
    const { error } = await sb.auth.resetPasswordForEmail(currentUser.email, { redirectTo: window.location.origin });
    if (error) throw error;
    alert('Password reset email sent! Check your inbox.');
  } catch (e) { alert('Failed: ' + e.message); }
});
$('#st-export')?.addEventListener('click', async () => {
  try {
    const { data } = await sb.from('connections').select('*').limit(5000);
    if (!data?.length) { alert('No data to export yet.'); return; }
    const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `brilliant-jobs-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { alert('Export failed: ' + e.message); }
});

// Logout
$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = '/';
});

// ---- Feedback Modal ----
let fbType = 'bug';
let fbFiles = []; // array of { file, dataUrl }

function setFbType(type) {
  fbType = type;
  $$('.fb-type-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.type === type) b.classList.add('active');
  });
  const icon = $('#fb-heading-icon');
  if (type === 'bug') {
    $('#fb-heading-text').textContent = 'Report a Bug';
    $('#fb-subheading').textContent = 'Found something off? Help us fix it.';
    $('#fb-title-label').textContent = 'What happened?';
    $('#fb-title').placeholder = 'Brief description of the issue…';
    $('#fb-details').placeholder = 'Steps to reproduce, expected vs actual behavior…';
    $('#fb-bug-help').style.display = '';
    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    icon.style.stroke = 'var(--red)';
  } else {
    $('#fb-heading-text').textContent = 'Request a Feature';
    $('#fb-subheading').textContent = "Have a brilliant idea? We're listening.";
    $('#fb-title-label').textContent = 'What would you like?';
    $('#fb-title').placeholder = 'Brief description of the feature idea…';
    $('#fb-details').placeholder = 'How would this help your job search? Any specifics on how it should work…';
    $('#fb-bug-help').style.display = 'none';
    icon.innerHTML = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none"/>';
    icon.style.stroke = 'var(--accent)';
  }
}

function handleFbFiles(fileList) {
  for (const file of fileList) {
    if (fbFiles.length >= 3) break;
    if (file.size > 5 * 1024 * 1024) { alert(file.name + ' is over 5MB'); continue; }
    if (!file.type.startsWith('image/')) { alert(file.name + ' is not an image'); continue; }
    const reader = new FileReader();
    reader.onload = e => {
      fbFiles.push({ file, dataUrl: e.target.result });
      renderFbThumbs();
    };
    reader.readAsDataURL(file);
  }
}

function renderFbThumbs() {
  const container = $('#fb-file-list');
  container.innerHTML = fbFiles.map((f, i) =>
    '<div class="fb-thumb">' +
      '<img src="' + f.dataUrl + '" alt="upload">' +
      '<div class="fb-thumb-x" data-idx="' + i + '">✕</div>' +
    '</div>'
  ).join('');
  container.querySelectorAll('.fb-thumb-x').forEach(x => {
    x.addEventListener('click', () => {
      fbFiles.splice(parseInt(x.dataset.idx), 1);
      renderFbThumbs();
    });
  });
}

// Drag and drop on upload zone
(function() {
  const zone = document.getElementById('fb-upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFbFiles(e.dataTransfer.files);
  });
})();

function openFeedback() {
  const activePage = document.querySelector('.page.active');
  const pageId = activePage?.id?.replace('page-', '') || '';
  const fbPage = $('#fb-page');
  if (fbPage) {
    const opt = [...fbPage.options].find(o => o.value === pageId);
    fbPage.value = opt ? pageId : '';
  }
  $('#fb-title').value = '';
  $('#fb-details').value = '';
  $('#fb-priority').value = 'medium';
  fbFiles = [];
  renderFbThumbs();
  setFbType('bug');
  $('#fb-form-view').style.display = '';
  $('#fb-success-view').style.display = 'none';
  $('#fb-submit-btn').disabled = false;
  $('#fb-submit-btn').textContent = 'Submit';
  $('#feedback-overlay').classList.add('open');
  setTimeout(() => $('#fb-title').focus(), 100);
}

function closeFeedback() {
  $('#feedback-overlay').classList.remove('open');
}

async function submitFeedback() {
  const title = $('#fb-title').value.trim();
  if (!title) { $('#fb-title').focus(); return; }

  const btn = $('#fb-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  // Upload images to Supabase Storage
  const imageUrls = [];
  for (const f of fbFiles) {
    try {
      const ext = f.file.name.split('.').pop() || 'png';
      const path = 'feedback/' + (currentUser?.id || 'anon') + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + '.' + ext;
      const { data, error } = await sb.storage.from('feedback-uploads').upload(path, f.file, { contentType: f.file.type });
      if (!error && data) {
        const { data: urlData } = sb.storage.from('feedback-uploads').getPublicUrl(path);
        if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
      }
    } catch (e) { console.warn('[BJ] File upload failed:', e); }
  }

  const payload = {
    user_id: currentUser?.id || null,
    user_email: currentUser?.email || null,
    type: fbType,
    page: $('#fb-page').value || null,
    title: title,
    details: $('#fb-details').value.trim() || null,
    priority: $('#fb-priority').value,
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    user_agent: navigator.userAgent,
    screen_size: window.innerWidth + 'x' + window.innerHeight,
    dashboard_version: BJ_VERSION,
  };

  try {
    const { error } = await sb.from('feedback').insert(payload);
    if (error) throw error;
    if (fbType === 'bug') {
      $('#fb-success-icon').textContent = '✓';
      $('#fb-success-icon').style.color = 'var(--green)';
      $('#fb-success-title').textContent = 'Bug report submitted!';
      $('#fb-success-msg').textContent = "We'll investigate and keep you posted.";
    } else {
      $('#fb-success-icon').textContent = '✓';
      $('#fb-success-icon').style.color = 'var(--accent)';
      $('#fb-success-title').textContent = 'Feature request received!';
      $('#fb-success-msg').textContent = "We'll review it and see what we can build.";
    }
    $('#fb-form-view').style.display = 'none';
    $('#fb-success-view').style.display = 'flex';
  } catch (e) {
    console.error('[BJ] Feedback submit error:', e);
    alert('Failed to submit feedback. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

$('#feedback-btn').addEventListener('click', openFeedback);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#feedback-overlay').classList.contains('open')) closeFeedback();
});


// === js/stats.js ===
// === js/stats.js ===
// Stats page — filter-scoped analytics with ECharts
// Redesigned per stats-page-redesign-brief.md (Pod 1, 2026-02-19)
// Dependencies: sb, savedFilters, filterColors, levelHierarchy, getJobLevel, buildFilterQuery, getLocationMatchIds

// ─── State ───
var statsInitialized = false;
var statsCharts = {};
var statsCache = {};
var STATS_CACHE_TTL = 10 * 60 * 1000;
var STATS_ROW_CAP = 5000;
var STATS_DEDUP_CAP = 10000;
var statsSelectedFilters = JSON.parse(localStorage.getItem('bj_stats_filters') || '["__all__"]');
var _statsDebounce = null;

// Light-theme ECharts (dark tooltips float over light cards)
// Color tokens — single source of truth, no hardcoded hsl() in chart functions
var _T = {
  border: 'hsl(228, 16%, 91%)',
  dim: 'hsl(228,11%,41%)',   // --text-dim equivalent
  faint: 'hsl(225,10%,63%)', // --text-faint equivalent
  dark: 'hsl(230,28%,14%)',  // --text equivalent
  mono: 'JetBrains Mono',
  sans: 'Outfit',
};
var STATS_THEME = {
  tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', borderWidth: 1, textStyle: { color: '#e8eaf0', fontFamily: _T.sans, fontSize: 12 } },
  axisLabel: { color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
  axisLine: { lineStyle: { color: 'hsl(228,16%,91%)' } },
  splitLine: { lineStyle: { color: 'hsl(228,16%,93%)' } },
  // Reusable label presets for chart functions
  catLabel: { color: _T.dim, fontFamily: _T.sans, fontSize: 11 },
  barLabel: { show: true, position: 'right', color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
};
var STATS_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];
var DEFAULT_LEVEL_HIERARCHY = [
  {label:'Entry Level', keywords:'entry level,entry-level,junior,jr,new grad,graduate'},
  {label:'Associate', keywords:'associate,assoc'},
  {label:'Mid', keywords:'mid level,mid-level,intermediate'},
  {label:'Senior', keywords:'senior,sr'},
  {label:'Staff', keywords:'staff'},
  {label:'Lead', keywords:'lead,team lead'},
  {label:'Principal', keywords:'principal,distinguished,fellow'},
  {label:'Manager', keywords:'manager,engineering manager,mgr'},
  {label:'Director', keywords:'director'},
  {label:'VP', keywords:'vp,vice president'},
  {label:'C-Suite', keywords:'cto,cfo,ceo,coo,cio,chief,c-suite,head of'},
];
var STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,company_slug,salary_min,salary_max,salary_currency,location,loc_type,loc_state,loc_city,first_seen_at,industry';

// ─── Init ───
function initStatsPage() {
  var page = document.getElementById('page-stats');
  if (!page || !page.classList.contains('active')) return;
  if (statsInitialized) { refreshStatsCharts(); return; }
  statsInitialized = true;
  renderFilterPills();
  fetchAndRenderStats();
  window.addEventListener('resize', statsResizeAll);
}

// ─── Filter Pills (CSS classes only, no inline styles) ───
function renderFilterPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  container.innerHTML = '';
  var isAll = statsSelectedFilters.includes('__all__');

  // "All" pill — no hamburger icon
  var allPill = document.createElement('button');
  allPill.className = 'stats-fpill' + (isAll ? ' active' : '');
  allPill.textContent = 'All';
  allPill.style.setProperty('--pill-color', 'var(--accent)');
  allPill.addEventListener('click', function() {
    statsSelectedFilters = ['__all__'];
    persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
  });
  container.appendChild(allPill);

  savedFilters.forEach(function(sf, idx) {
    var pill = document.createElement('button');
    var color = filterColors[idx % filterColors.length];
    var isActive = isAll || statsSelectedFilters.includes(String(idx));
    pill.className = 'stats-fpill' + (isActive ? ' active' : '');
    pill.style.setProperty('--pill-color', color);

    // Colored dot
    var dot = document.createElement('span');
    dot.className = 'stats-fpill-dot';
    dot.style.background = color;
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(sf.name || ('Filter ' + (idx + 1))));

    pill.addEventListener('click', function() {
      var id = String(idx);
      statsSelectedFilters = statsSelectedFilters.filter(function(f) { return f !== '__all__'; });
      var pos = statsSelectedFilters.indexOf(id);
      if (pos > -1) statsSelectedFilters.splice(pos, 1);
      else statsSelectedFilters.push(id);
      if (statsSelectedFilters.length === 0) statsSelectedFilters = ['__all__'];
      persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
    });
    container.appendChild(pill);
  });
}

function persistFilterSelection() { localStorage.setItem('bj_stats_filters', JSON.stringify(statsSelectedFilters)); }

// ─── Data ───
function debouncedFetchAndRender() { clearTimeout(_statsDebounce); _statsDebounce = setTimeout(fetchAndRenderStats, 300); }

async function fetchAndRenderStats() {
  showStatsLoading(true);
  try {
    var configs = getSelectedFilterConfigs();
    if (configs.length === 0) { showEmptyState('no-filters'); return; }
    var allRows = [], anyCapped = false;
    for (var i = 0; i < configs.length; i++) {
      var sf = configs[i].sf, idx = configs[i].idx;
      var ck = JSON.stringify(sf) + '_' + idx;
      var cached = statsCache[ck];
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        allRows = allRows.concat(cached.rows);
        if (cached.capped) anyCapped = true;
        continue;
      }
      var rows = await fetchFilterData(sf);
      var capped = rows.length >= STATS_ROW_CAP;
      statsCache[ck] = { rows: rows, timestamp: Date.now(), capped: capped };
      allRows = allRows.concat(rows);
      if (capped) anyCapped = true;
    }
    var seen = {}, deduped = [];
    for (var j = 0; j < allRows.length; j++) {
      var r = allRows[j], k = r.greenhouse_id + ':' + r.ats_source;
      if (!seen[k]) { seen[k] = true; deduped.push(r); if (deduped.length >= STATS_DEDUP_CAP) break; }
    }
    if (deduped.length === 0) { showEmptyState('no-results'); return; }
    var stats = aggregateStats(deduped);
    showStatsLoading(false);
    renderStatCards(stats);
    renderTimeline(stats);
    renderSalaryDist(stats);
    renderSeniorityBars(stats);
    renderTopCompanies(stats);
    renderWorkType(stats);
    renderPostingAge(stats);
    renderGeoMap(stats, configs);
    renderSalaryByLevel(stats);
    var notice = document.getElementById('stats-cap-notice');
    if (notice) {
      if (anyCapped) { notice.textContent = 'Based on ' + deduped.length.toLocaleString() + ' most recent matches'; notice.style.display = ''; }
      else { notice.style.display = 'none'; }
    }
  } catch (err) { console.error('[Stats] Fetch error:', err); showEmptyState('error'); }
}

function getSelectedFilterConfigs() {
  if (savedFilters.length === 0) return [];
  if (statsSelectedFilters.includes('__all__')) return savedFilters.map(function(sf, i) { return {sf:sf, idx:i}; });
  return statsSelectedFilters.map(function(id) { return {sf: savedFilters[Number(id)], idx: Number(id)}; }).filter(function(x) { return x.sf; });
}

async function fetchFilterData(sf) {
  try {
    var tuning = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
    var locIds = await getLocationMatchIds(sf.wherePills || [], sf.whereNotPills || [], tuning, sf.includeRemote);
    var base = sb.from('ats_jobs').select(STATS_COLUMNS);
    var q = buildFilterQuery(sf, base, locIds);
    // Exclude user-hidden jobs to match feed counts
    var hiddenIds = JSON.parse(localStorage.getItem('bj_hidden') || '[]');
    if (hiddenIds.length > 0) { q = q.not('greenhouse_id', 'in', '(' + hiddenIds.join(',') + ')'); }
    q = q.order('first_seen_at', { ascending: false }).limit(STATS_ROW_CAP);
    var res = await q;
    if (res.error) { console.error('[Stats] Query error:', res.error); return []; }
    return res.data || [];
  } catch (e) { console.error('[Stats] fetchFilterData:', e); return []; }
}

// ─── Aggregation ───
function aggregateStats(rows) {
  var s = { total: rows.length, medianSalary: null, seniorPct: 0, remotePct: 0, companyCount: 0,
    levelCounts: {}, salaryBuckets: {}, topCompanies: [], workTypeCounts: {}, timelineBuckets: {},
    salaryByLevel: {}, industryCounts: {}, salaryJobCount: 0, industryNonNull: 0 };

  var cos = {}; rows.forEach(function(r) { var ck = r.company_slug || r.company_name; if (ck) cos[ck] = true; });
  s.companyCount = Object.keys(cos).length;

  // Seniority + salary-by-level in one pass
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  hier.map(function(l) { return l.label; }).forEach(function(l) { s.levelCounts[l] = 0; });
  s.levelCounts['Other'] = 0;
  var seniorSet = {Senior:1,Staff:1,Lead:1,Principal:1,Manager:1,Director:1,VP:1,'C-Suite':1,'Sr Director':1,'Assoc Director':1,'Sr Manager':1};
  var seniorN = 0;
  var salByLvl = {};

  rows.forEach(function(r) {
    var lvl = getJobLevel(r.title, hier);
    var label = lvl ? lvl.label : 'Other';
    s.levelCounts[label] = (s.levelCounts[label] || 0) + 1;
    if (lvl && seniorSet[lvl.label]) seniorN++;
    var sal = (r.salary_min && r.salary_max) ? (r.salary_min + r.salary_max) / 2 : (r.salary_min || r.salary_max || 0);
    if (sal > 0) { if (!salByLvl[label]) salByLvl[label] = []; salByLvl[label].push(sal); }
  });
  s.seniorPct = rows.length > 0 ? Math.round((seniorN / rows.length) * 100) : 0;
  Object.keys(salByLvl).forEach(function(label) {
    var arr = salByLvl[label].sort(function(a,b){return a-b;});
    var n = arr.length;
    var p = function(pct) { var i = Math.floor(pct * (n - 1)); var f = pct * (n - 1) - i; return Math.round(arr[i] + (arr[Math.min(i+1,n-1)] - arr[i]) * f); };
    s.salaryByLevel[label] = { avg: Math.round(arr.reduce(function(a,b){return a+b;},0) / n), p15: p(0.15), median: p(0.5), p85: p(0.85), count: n };
  });

  // Remote
  var remN = 0;
  rows.forEach(function(r) { if (r.loc_type === 'remote' || (r.location||'').toLowerCase().startsWith('remote')) remN++; });
  s.remotePct = rows.length > 0 ? Math.round((remN / rows.length) * 100) : 0;

  // Salary distribution
  var sals = [];
  rows.forEach(function(r) { var v = r.salary_min || r.salary_max; if (v && v > 0) sals.push(v); });
  s.salaryJobCount = sals.length;
  sals.sort(function(a,b) { return a-b; });
  if (sals.length > 0) {
    var mid = Math.floor(sals.length / 2);
    s.medianSalary = sals.length % 2 === 0 ? Math.round((sals[mid-1]+sals[mid])/2) : sals[mid];
  }
  rows.forEach(function(r) {
    var v = r.salary_min || r.salary_max; if (!v || v <= 0) return;
    var b = Math.floor(v / 25000) * 25000;
    s.salaryBuckets['$' + (b/1000) + 'K'] = (s.salaryBuckets['$' + (b/1000) + 'K']||0) + 1;
  });

  // Top companies (top 10 per brief)
  var cc = {};
  rows.forEach(function(r) { if (r.company_name) cc[r.company_name] = (cc[r.company_name]||0) + 1; });
  s.topCompanies = Object.entries(cc).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 10);

  // Work type
  s.workTypeCounts = { 'Remote': 0, 'On-site': 0, 'Hybrid': 0, 'Unspecified': 0 };
  rows.forEach(function(r) {
    var loc = (r.location || '').toLowerCase();
    var lt = (r.loc_type || '').toLowerCase();
    if (lt === 'remote' || loc.startsWith('remote')) s.workTypeCounts['Remote']++;
    else if (lt === 'hybrid' || loc.includes('hybrid')) s.workTypeCounts['Hybrid']++;
    else if (r.location && r.location.trim()) s.workTypeCounts['On-site']++;
    else s.workTypeCounts['Unspecified']++;
  });

  // Timeline — 12 complete weeks + WTD 13th (unless today is last day of week period)
  var weekMap = {};
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var d = new Date(r.first_seen_at);
    var day = d.getDay();
    var mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    weekMap[mon.toISOString().slice(0, 10)] = (weekMap[mon.toISOString().slice(0, 10)]||0) + 1;
  });
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayDay = today.getDay();
  var thisMonday = new Date(today); thisMonday.setDate(today.getDate() - (todayDay === 0 ? 6 : todayDay - 1));
  var isSunday = todayDay === 0;
  // 12 complete past weeks
  for (var w = 12; w >= 1; w--) {
    var weekStart = new Date(thisMonday); weekStart.setDate(thisMonday.getDate() - (w * 7));
    var wk = weekStart.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
  }
  // 13th slot: WTD (current week) unless today is Sunday (last day = week complete)
  if (!isSunday) {
    var wtdKey = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wtdKey] = weekMap[wtdKey] || 0;
    s.timelineWtdKey = wtdKey;
  } else {
    // Today is Sunday — this week is complete, show it as the 13th complete week
    var wk = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
    s.timelineWtdKey = null;
  }

  // Industry
  rows.forEach(function(r) {
    if (r.industry && r.industry.trim()) {
      s.industryNonNull++;
      s.industryCounts[r.industry.trim()] = (s.industryCounts[r.industry.trim()]||0) + 1;
    }
  });

  // Posting age distribution (days since first_seen_at)
  s.postingAgeBuckets = {'0-7 days':0,'8-14 days':0,'15-30 days':0,'31-60 days':0,'61-90 days':0,'90+ days':0};
  var nowMs = Date.now();
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var age = Math.floor((nowMs - new Date(r.first_seen_at).getTime()) / 86400000);
    if (age <= 7) s.postingAgeBuckets['0-7 days']++;
    else if (age <= 14) s.postingAgeBuckets['8-14 days']++;
    else if (age <= 30) s.postingAgeBuckets['15-30 days']++;
    else if (age <= 60) s.postingAgeBuckets['31-60 days']++;
    else if (age <= 90) s.postingAgeBuckets['61-90 days']++;
    else s.postingAgeBuckets['90+ days']++;
  });

  // Location aggregation for map + metro list (US only)
  s.stateCounts = {};
  s.cityCounts = {};
  s.locationCounts = {};
  s.locationsTotal = 0;
  var US_ST = {AL:1,AK:1,AZ:1,AR:1,CA:1,CO:1,CT:1,DC:1,DE:1,FL:1,GA:1,HI:1,ID:1,IL:1,IN:1,IA:1,KS:1,KY:1,LA:1,ME:1,MD:1,MA:1,MI:1,MN:1,MS:1,MO:1,MT:1,NE:1,NV:1,NH:1,NJ:1,NM:1,NY:1,NC:1,ND:1,OH:1,OK:1,OR:1,PA:1,RI:1,SC:1,SD:1,TN:1,TX:1,UT:1,VT:1,VA:1,WA:1,WV:1,WI:1,WY:1};
  function normalizeLocation(raw) {
    var loc = raw.toLowerCase().trim();
    // Strip country suffixes
    loc = loc.replace(/,?\s*united states$/,'').replace(/,?\s*usa$/,'').replace(/,?\s*us$/,'').trim();
    // Handle remote variants
    if (loc === 'remote' || loc === '') return null;
    if (/^remote\s*[-–—]\s*/.test(loc)) loc = loc.replace(/^remote\s*[-–—]\s*/,'').trim();
    if (/^remote,?\s*/.test(loc) && loc !== 'remote') loc = loc.replace(/^remote,?\s*/,'').trim();
    if (loc === '' || loc === 'remote') return null;
    // Handle "(remote)" suffix
    loc = loc.replace(/\s*\(remote\)\s*$/,'').trim();
    // Multi-location: split on semicolons and take first
    if (loc.indexOf(';') !== -1) loc = loc.split(';')[0].trim();
    if (!loc) return null;
    return loc;
  }
  rows.forEach(function(r) {
    var raw = (r.location || '').trim();
    var loc = normalizeLocation(raw);
    if (loc) {
      s.locationsTotal++;
      s.locationCounts[loc] = (s.locationCounts[loc]||0) + 1;
    }
    if (r.loc_state && US_ST[r.loc_state]) {
      s.stateCounts[r.loc_state] = (s.stateCounts[r.loc_state]||0) + 1;
      if (r.loc_city) {
        var key = r.loc_city + ', ' + r.loc_state;
        s.cityCounts[key] = (s.cityCounts[key]||0) + 1;
      }
    }
  });

  return s;
}

// ─── Stat Cards ───
function renderStatCards(stats) {
  var fmt = function(n) { return n != null ? n.toLocaleString() : '\u2014'; };
  var fmtK = function(n) { if (n == null) return 'N/A'; return n >= 1000 ? ('$' + Math.round(n/1000) + 'K') : ('$' + fmt(n)); };
  setText('#sc-total', fmt(stats.total));
  setText('#sc-salary', fmtK(stats.medianSalary));
  setText('#sc-senior', stats.seniorPct + '%');
  setText('#sc-remote', stats.remotePct + '%');
  setText('#sc-companies', fmt(stats.companyCount));
}
function setText(sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; }

// ─── Chart Helpers ───
function getOrCreateChart(id) {
  var el = document.getElementById(id.replace('#',''));
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
  if (statsCharts[id]) return statsCharts[id];
  var c = echarts.init(el, null, { renderer: 'canvas' });
  statsCharts[id] = c;
  return c;
}
function ttip() { return { backgroundColor:STATS_THEME.tooltip.backgroundColor, borderColor:STATS_THEME.tooltip.borderColor, borderWidth:1, textStyle:STATS_THEME.tooltip.textStyle }; }
function truncName(s, max) { return s && s.length > max ? s.slice(0, max) + '\u2026' : s; }
function emptyChart(chart, msg) {
  chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:msg,fill:_T.dim,fontSize:12,fontFamily:_T.sans,textAlign:'center',lineHeight:20}}], xAxis:{show:false},yAxis:{show:false},series:[] }, true);
}

// ─── C1: Job Count Over Time — bars, last 12 weeks, continuous ───
function renderTimeline(stats) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sorted = Object.entries(stats.timelineBuckets).sort(function(a,b){ return a[0].localeCompare(b[0]); });
  // Compute cumulative
  var cum = [], running = 0;
  sorted.forEach(function(e) { running += e[1]; cum.push(running); });
  chart.setOption({
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var d=new Date(p[0].name); var isWtd = stats.timelineWtdKey && p[0].name === stats.timelineWtdKey; var cumVal=p[1]?p[1].value:0; return '<b>'+(isWtd?'WTD: ':'Week of ')+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</b><br/>'+p[0].value+' new jobs'+(isWtd?' (so far)':'')+'<br/>'+cumVal+' cumulative'; }}, ttip()),
    grid: { top:30, right:50, bottom:30, left:50 },
    xAxis: { type:'category', data:sorted.map(function(e){return e[0];}),
      axisLabel: { color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0,
        formatter:function(v){ var d=new Date(v); var label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); return stats.timelineWtdKey && v===stats.timelineWtdKey ? label+'\n(WTD)' : label; }},
      axisLine: STATS_THEME.axisLine },
    yAxis: [
      { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
      { type:'value', position:'right', axisLabel:{ color:'rgba(99,102,241,0.6)', fontFamily:_T.mono, fontSize:10, formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, splitLine:{show:false}, axisLine:{show:false}, axisTick:{show:false} }
    ],
    series: [{ type:'bar', yAxisIndex:0, data:sorted.map(function(e){
        var isWtd = stats.timelineWtdKey && e[0] === stats.timelineWtdKey;
        return { value:e[1], itemStyle:{ color: isWtd
          ? new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#818cf8'},{offset:1,color:'rgba(129,140,248,0.3)'}])
          : new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#60a5fa'},{offset:1,color:'rgba(59,130,246,0.4)'}]),
          borderRadius:[3,3,0,0], borderType: isWtd ? 'dashed' : 'solid' }};
      }),
      barMaxWidth:28 },
      { type:'line', yAxisIndex:1, data:cum, smooth:0.3, symbol:'none',
        lineStyle:{color:'rgba(99,102,241,0.7)',width:2},
        areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(99,102,241,0.15)'},{offset:1,color:'rgba(99,102,241,0)'}])} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C2: Salary Distribution — pie chart, ordered low→high, salary-data colors ───
function renderSalaryDist(stats) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var sub = document.getElementById('chart-salary-sub');
  if (sub) sub.textContent = stats.salaryJobCount + ' of ' + stats.total + ' jobs have salary data';

  var entries = Object.entries(stats.salaryBuckets).map(function(e) {
    return { label:e[0], count:e[1], num:parseInt(e[0].replace('$','').replace('K',''))*1000 };
  }).sort(function(a,b){return a.num-b.num;}).filter(function(e){return e.num>=25000 && e.num<=500000;});

  if (entries.length < 3) {
    emptyChart(chart, 'Not enough salary data for this filter.\nTry broadening your search.');
    return;
  }

  // Color gradient: cool (low salary) → warm (high salary), matching salary-data page
  var salaryColors = ['#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#ef4444','#f97316','#f59e0b','#eab308','#22c55e'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.mono,fontSize:10},
      formatter:function(name){var e=entries.find(function(x){return x.label===name;}); return name+(e?' ('+e.count+')':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:entries.map(function(e,i){return {name:e.label, value:e.count, itemStyle:{color:salaryColors[i%salaryColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C3: Seniority — pie chart, ordered Entry→C-Suite. Suppress when Unclassified > 80% ───
function renderSeniorityBars(stats) {
  var chart = getOrCreateChart('#chart-funnel'); if (!chart) return;
  var otherCount = stats.levelCounts['Other'] || 0;
  var unclPct = stats.total > 0 ? (otherCount / stats.total) * 100 : 100;

  if (unclPct > 95) {
    emptyChart(chart, 'Most jobs haven\'t been classified by seniority.\nConfigure your level keywords in\nTuning \u2192 Level Hierarchy to improve this.');
    return;
  }

  // Ordered Entry → C-Suite (correct career ladder)
  var SENIORITY_ORDER = ['Intern','Entry','Associate','Mid','Senior','Staff','Lead','Head','Principal','Sr Manager','Manager','Sr Director','Director','VP','C-Suite'];
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var data = SENIORITY_ORDER.map(function(label) {
    var count = stats.levelCounts[label] || 0;
    return count > 0 ? {name:label, value:count} : null;
  }).filter(Boolean);
  // Add any levels not in the fixed order
  hier.forEach(function(l) {
    if (SENIORITY_ORDER.indexOf(l.label) === -1 && stats.levelCounts[l.label] > 0) {
      data.push({name:l.label, value:stats.levelCounts[l.label]});
    }
  });
  if (otherCount > 0 && unclPct <= 95) data.push({name:'Other', value:otherCount});

  if (data.length === 0) { emptyChart(chart, 'No seniority data'); return; }

  // Colors: cool (entry) → warm (C-suite), matching salary-data page seniority palette
  var senColors = ['#3b82f6','#6366f1','#8b5cf6','#22c55e','#14b8a6','#f59e0b','#f97316','#ec4899','#ef4444','#dc2626','#94a3b8'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){ var pct=stats.total>0?Math.round(p.value/stats.total*100):0; return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+pct+'%)'; }}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:10},
      formatter:function(name){var d=data.find(function(x){return x.name===name;}); var total=data.reduce(function(a,b){return a+b.value;},0); var pct=d&&total>0?Math.round(d.value/total*100):0; return name+(d?' ('+pct+'%)':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:data.map(function(d,i){return {name:d.name, value:d.value, itemStyle:{color:senColors[i%senColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C5: Industry Treemap — same categories as Data Lab ───
function renderTopCompanies(stats) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  var ind = stats.industryCounts;
  var sorted = Object.entries(ind).sort(function(a,b){return b[1]-a[1];});
  
  if (sorted.length === 0) {
    emptyChart(chart, 'No industry data available for this filter.');
    return;
  }

  var treePAL = ['#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ec4899','#6366f1','#ef4444','#14b8a6','#f97316','#8b5cf6','#0ea5e9','#d946ef','#84cc16','#e11d48'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+Number(p.value).toLocaleString()+' jobs';}}, ttip()),
    series: [{ type:'treemap',
      data:sorted.map(function(d,i){return {name:d[0], value:d[1], itemStyle:{color:treePAL[i%treePAL.length], borderColor:'#fff', borderWidth:2}};}),
      label:{fontSize:12,fontFamily:'Outfit',fontWeight:500,color:'#fff',formatter:function(p){return p.name+'\n'+Number(p.value).toLocaleString();}},
      breadcrumb:{show:false}, roam:false, nodeClick:false,
      levels:[{itemStyle:{borderRadius:8}}],
      animationDuration:800 }],
  }, true);
}

// ─── C7: Work Arrangement — donut (correct for categorical composition) ───
function renderWorkType(stats) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var wt = stats.workTypeCounts;
  var typeColors = { 'Remote':'#22c55e', 'On-site':'#6366f1', 'Hybrid':'#f59e0b', 'Unspecified':'#334155' };
  var total = Object.values(wt).reduce(function(a,b){return a+b;},0);
  var unspecPct = total > 0 ? (wt['Unspecified'] / total) * 100 : 0;

  // Suppress Unspecified segment when > 50%
  var order = ['Remote','On-site','Hybrid'];
  if (unspecPct <= 50) order.push('Unspecified');

  var data = order.filter(function(t){return wt[t]>0;})
    .map(function(t){return {name:t, value:wt[t], itemStyle:{color:typeColors[t]}};});
  var displayTotal = data.reduce(function(a,d){return a+d.value;},0);

  if (data.length === 0) { emptyChart(chart, 'No location data available'); return; }

  var noteText = unspecPct > 50 ? 'Location type not specified for many jobs' : '';
  chart.setOption({
    graphic: noteText ? [{type:'text',left:'center',bottom:5,style:{text:noteText,fill:_T.faint,fontSize:10,fontFamily:_T.sans}}] : [],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:10, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:12},
      formatter:function(name){ var v=wt[name]||0; var pct=displayTotal>0?Math.round(v/displayTotal*100):0; return name+'  '+pct+'%'; }},
    series: [{ type:'pie', radius:['42%','70%'], center:['35%','50%'], avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:14,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      data:data }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C6: Salary by Level — threshold: 100+ jobs AND 3+ levels with 5+ salary points ───
function renderSalaryByLevel(stats) {
  var card = document.getElementById('chart-salary-level');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var salLvl = stats.salaryByLevel;

  var qualifiedLevels = Object.keys(salLvl).filter(function(l){ return salLvl[l].count >= 5; });
  var meetsThreshold = stats.total >= 100 && qualifiedLevels.length >= 3;

  if (!meetsThreshold) {
    if (cardWrap) cardWrap.style.display = 'none';
    return;
  }
  if (cardWrap) cardWrap.style.display = '';

  var chart = getOrCreateChart('#chart-salary-level'); if (!chart) return;
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var ordered = hier.map(function(l){return l.label;}).filter(function(l){return salLvl[l] && salLvl[l].count>=5;})
    .map(function(l){return {label:l, avg:salLvl[l].avg, p15:salLvl[l].p15, median:salLvl[l].median, p85:salLvl[l].p85, count:salLvl[l].count};});
  if (salLvl['Other'] && salLvl['Other'].count >= 5) ordered.push({label:'Other', avg:salLvl['Other'].avg, p15:salLvl['Other'].p15, median:salLvl['Other'].median, p85:salLvl['Other'].p85, count:salLvl['Other'].count});

  var overallAvg = 0, totalCount = 0;
  ordered.forEach(function(d){overallAvg += d.avg * d.count; totalCount += d.count;});
  overallAvg = totalCount > 0 ? Math.round(overallAvg / totalCount) : 0;

  var barColors = ['#6366f1','#818cf8','#a78bfa','#22c55e','#34d399','#f59e0b','#fbbf24','#ec4899','#f97316','#ef4444','#06b6d4','#8b5cf6'];
  var fK = function(v){return '$'+Math.round(v/1000)+'K';};

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var idx=p[0].dataIndex; var d=ordered[idx]; if(!d)return ''; return '<b>'+d.label+'</b> ('+d.count+' jobs)<br/>P85: '+fK(d.p85)+'<br/>Median: <b>'+fK(d.median)+'</b><br/>P15: '+fK(d.p15); }}, ttip()),
    grid: { top:30, right:30, bottom:40, left:60 },
    xAxis: { type:'category', data:ordered.map(function(d){return d.label;}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, rotate:ordered.length>8?30:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10,
      formatter:function(v){return fK(v);}}, splitLine:STATS_THEME.splitLine },
    series: [
      { name:'P15 base', type:'bar', stack:'range', data:ordered.map(function(d){return {value:d.p15, itemStyle:{color:'transparent'}};}),
        barMaxWidth:40, itemStyle:{borderRadius:0} },
      { name:'Range', type:'bar', stack:'range', data:ordered.map(function(d,i){return {value:d.p85-d.p15, itemStyle:{color:barColors[i%barColors.length],opacity:0.35,borderRadius:[4,4,0,0]}};}),
        barMaxWidth:40 },
      { name:'Median', type:'scatter', symbol:'rect', symbolSize:function(v,p){return [36,3];},
        data:ordered.map(function(d,i){return {value:d.median, itemStyle:{color:barColors[i%barColors.length]}};}),
        z:10, label:{ show:ordered.length<=8, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
          formatter:function(p){return fK(p.value);}}}
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C8: Industry — threshold: industry non-null > 60% ───
function renderIndustryBars(stats) {
  var card = document.getElementById('chart-industry');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var coveragePct = stats.total > 0 ? (stats.industryNonNull / stats.total) * 100 : 0;

  if (cardWrap) cardWrap.style.display = '';
  if (coveragePct < 1) {
    emptyChart(chart || getOrCreateChart('#chart-industry'), 'Industry data available for ' + stats.industryNonNull + ' of ' + stats.total + ' jobs (' + Math.round(coveragePct) + '%). More enrichment coming soon.');
    return;
  }

  var chart = getOrCreateChart('#chart-industry'); if (!chart) return;
  var sorted = Object.entries(stats.industryCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  if (sorted.length === 0) { emptyChart(chart, 'No industry data available'); return; }

  var rev = sorted.slice().reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:160 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    yAxis: { type:'category', data:rev.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, width:150, overflow:'truncate' }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:rev.map(function(e){return e[1];}),
      itemStyle:{ color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(34,197,94,0.3)'},{offset:1,color:'#22c55e'}]), borderRadius:[0,3,3,0] },
      barMaxWidth:18,
      label:STATS_THEME.barLabel}],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Posting Age Distribution — bar chart ───
function renderPostingAge(stats) {
  var chart = getOrCreateChart('#chart-posting-age'); if (!chart) return;
  var buckets = stats.postingAgeBuckets;
  var labels = ['0-7 days','8-14 days','15-30 days','31-60 days','61-90 days','90+ days'];
  var ageColors = ['#3b82f6','#6366f1','#8b5cf6','#f59e0b','#f97316','#ef4444'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:20, right:20, bottom:35, left:50 },
    xAxis: { type:'category', data:labels,
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [{ type:'bar', data:labels.map(function(l,i){return {value:buckets[l]||0, itemStyle:{color:ageColors[i], borderRadius:[3,3,0,0]}};}),
      barMaxWidth:36,
      label:{ show:true, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value>0?p.value:'';}} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Geo Map + Top Metros/Cities ───
function renderGeoMap(stats, configs) {
  var mapEl = document.getElementById('chart-geo-map');
  var listEl = document.getElementById('chart-geo-list');
  var titleEl = document.getElementById('chart-geo-title');
  if (!mapEl) return;

  var stateCounts = stats.stateCounts || {};
  var cityCounts = stats.cityCounts || {};
  var locationCounts = stats.locationCounts || {};
  var stateEntries = Object.entries(stateCounts).sort(function(a,b){return b[1]-a[1];});
  var locationEntries = Object.entries(locationCounts).sort(function(a,b){return b[1]-a[1];});

  if (locationEntries.length === 0 && stateEntries.length === 0) {
    mapEl.innerHTML = '<div style="text-align:center;padding:80px 20px;color:'+_T.dim+';font-size:12px">No location data for this filter</div>';
    if (listEl) listEl.innerHTML = '';
    return;
  }

  // For small result sets (<75 jobs), show a clean list instead of a bar chart
  if (stats.total < 75) {
    // Destroy existing chart if any
    if (statsCharts['#chart-geo-map']) { statsCharts['#chart-geo-map'].dispose(); delete statsCharts['#chart-geo-map']; }
    if (titleEl) titleEl.textContent = 'Where Are the Jobs (' + stats.locationsTotal + ' of ' + stats.total + ' have locations)';
    var top20 = locationEntries.slice(0, 20);
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">';
    top20.forEach(function(e, i) {
      html += '<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid '+_T.border+';font-size:13px;' + (i%2===0?'border-right:1px solid '+_T.border+';':'') + '">' +
        '<span style="color:'+_T.dim+'">' + e[0] + '</span>' +
        '<span style="font-weight:700;font-family:'+_T.mono+';color:'+_T.dark+'">' + e[1] + '</span></div>';
    });
    html += '</div>';
    if (stats.locationsTotal === 0) {
      html = '<div style="text-align:center;padding:60px 20px;color:'+_T.dim+';font-size:13px">All jobs in this filter are remote or have no location specified</div>';
    }
    mapEl.innerHTML = html;
    mapEl.style.height = 'auto';
    if (listEl) listEl.style.display = 'none';
    return;
  }
  // For larger result sets, restore chart height and show list
  mapEl.style.height = '400px';
  if (listEl) listEl.style.display = '';

  // Detect if filter has metro pills
  var hasMetroPills = false;
  if (configs && configs.length > 0) {
    configs.forEach(function(c) {
      if (c.sf && c.sf.wherePills) {
        c.sf.wherePills.forEach(function(p) {
          if (p.locType === 'metro' || p.locType === 'city') hasMetroPills = true;
        });
      }
    });
  }

  // Title
  if (titleEl) titleEl.textContent = hasMetroPills ? 'Where Are the Jobs (Cities)' : 'Where Are the Jobs';

  // Map via ECharts (simple US bar chart by state for now — SVG map would need registered map)
  var chart = statsCharts['#chart-geo-map'];
  if (!chart) { chart = echarts.init(mapEl, null, {renderer:'canvas'}); statsCharts['#chart-geo-map'] = chart; }
  
  var top15 = stateEntries.slice(0,15).reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:40 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:top15.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:11 }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:top15.map(function(e,i){return {value:e[1],
      itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(59,130,246,0.2)'},{offset:1,color:'#3b82f6'}]), borderRadius:[0,3,3,0]}};}),
      barMaxWidth:18, label:{ show:true, position:'right', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value.toLocaleString();}} }],
    animation:true, animationDuration:600,
  }, true);

  // List: top 10 metros or cities
  if (!listEl) return;
  var listData;
  if (hasMetroPills) {
    // Show cities within the metro filter areas
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top Cities in Filter</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  } else {
    // Show top metro areas (city, state combos)
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top 10 Metro Areas</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  }
}

// ─── Loading / Empty (no inline styles) ───
function showStatsLoading(on) {
  var grid = document.getElementById('stats-charts-grid');
  var empty = document.getElementById('stats-empty');
  if (empty) empty.style.display = 'none';
  if (on) {
    ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){ var e=document.querySelector(s); if(e) e.textContent='\u2014'; });
    if (grid) grid.classList.add('loading');
  } else { if (grid) grid.classList.remove('loading'); }
}
function showEmptyState(reason) {
  showStatsLoading(false);
  var msgs = { 'no-filters':'Create saved filters on the Jobs Feed page to see your personalized stats',
    'no-results':'No jobs match this filter. Try broadening your search criteria.',
    'error':'Something went wrong loading stats. Try refreshing the page.' };
  ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){setText(s,'\u2014');});
  var el = document.getElementById('stats-empty');
  if (el) { el.textContent = msgs[reason]||msgs['error']; el.style.display = ''; }
}

// ─── Resize / Refresh ───
function statsResizeAll() { Object.values(statsCharts).forEach(function(c){ if(c&&!c.isDisposed()) c.resize(); }); }
function refreshStatsCharts() {
  renderFilterPills();
  var stale = Object.values(statsCache).some(function(c){return Date.now()-c.timestamp>=STATS_CACHE_TTL;});
  if (stale || Object.keys(statsCache).length === 0) fetchAndRenderStats();
  else statsResizeAll();
}


// === js/admin.js ===
/* ───────────────────────────────────────────────────────────
   admin.js — Tabbed Admin Console
   Tab 1: Feed Health (existing)
   Tab 2: Cohorts
   Tab 3: Users + Sessions
   Tab 4: SEO / Data Coverage
   Tab 5: Revenue
   ─────────────────────────────────────────────────────────── */

// ─── Admin access gate ───
function checkAdminAccess() {
  if (typeof sb === 'undefined') { console.warn('[Admin] No sb client'); return; }
  sb.auth.getUser().then(function(res) {
    if (!res.data || !res.data.user) { console.warn('[Admin] No authenticated user'); return; }
    console.log('[Admin] Checking role for', res.data.user.email);
    sb.from('profiles').select('role').eq('id', res.data.user.id).single().then(function(r) {
      if (r.error) { console.error('[Admin] Profile query error:', r.error.message); return; }
      if (r.data && r.data.role === 'admin') {
        var nav = document.getElementById('nav-admin');
        if (nav) { nav.style.display = ''; console.log('[Admin] ✓ Nav shown'); }
      }
    }).catch(function(e) { console.error('[Admin] Profile query failed:', e); });
  }).catch(function(e) { console.error('[Admin] getUser failed:', e); });
}

// ─── Tab state ───
var adminActiveTab = localStorage.getItem('bj_admin_tab') || 'feed-health';
var _adminTabInit = {};
var adminPeriod = parseInt(localStorage.getItem('bj_admin_period')) || 168;

function initAdminPage() {
  var page = document.getElementById('page-admin');
  if (!page || !page.classList.contains('active')) {
    console.log('[Admin] page not active, skipping');
    return;
  }
  // Guard: don't load data until user is authenticated
  if (typeof currentUser === 'undefined' || !currentUser) {
    console.log('[Admin] waiting for auth, deferring load');
    _adminTabInit = {}; // reset so it reloads when auth is ready
    return;
  }
  console.log('[Admin] initAdminPage called');
  initAdminTabs();
}

function initAdminTabs() {
  var tabBar = document.getElementById('admin-tabs');
  if (!tabBar) return;

  tabBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.admin-tab');
    if (!btn || btn.classList.contains('disabled')) return;
    switchAdminTab(btn.dataset.tab);
  });

  // Period toggle (lives inside feed-health panel)
  var periodToggle = document.getElementById('admin-period-toggle');
  if (periodToggle) {
    periodToggle.addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-period-btn');
      if (!btn) return;
      periodToggle.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      adminPeriod = parseInt(btn.dataset.hours);
      localStorage.setItem('bj_admin_period', adminPeriod);
      _adminTabInit['feed-health'] = false;
      loadBoardHealth();
    });
    periodToggle.querySelectorAll('.admin-period-btn').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.hours) === adminPeriod);
    });
  }

  switchAdminTab(adminActiveTab);
}

function switchAdminTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  document.querySelectorAll('.admin-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'admin-panel-' + tabId);
  });
  adminActiveTab = tabId;
  localStorage.setItem('bj_admin_tab', tabId);

  if (!_adminTabInit[tabId]) {
    _adminTabInit[tabId] = true;
    switch (tabId) {
      case 'feed-health': loadBoardHealth(); break;
      case 'cohorts': loadCohortTab(); break;
      case 'users': loadUsersTab(); break;
      case 'seo': loadSeoTab(); break;
      case 'revenue': loadRevenueTab(); break;
    }
  }
}

// ─── Helpers ───
function setAdminText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function fmtAdminNum(n) {
  if (n == null) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
  return String(n);
}

function fmtAdminPct(n, d) {
  if (!d || d === 0) return '—';
  return Math.round(n / d * 100) + '%';
}

// ═══════════════════════════════════════════════════════════
// TAB 1: FEED HEALTH
// ═══════════════════════════════════════════════════════════

async function loadBoardHealth() {
  console.log('[Admin] loadBoardHealth called, period:', adminPeriod);
  try {
    var snapshot = await sb.rpc('get_board_health', { period_hours: adminPeriod });
    console.log('[Admin] RPC data:', snapshot.data);
    if (snapshot.error) { console.error('[Admin] RPC error:', snapshot.error); return; }
    var d = snapshot.data;
    if (!d) return;

    setAdminText('ah-total', fmtAdminNum(d.total_feeds));
    setAdminText('ah-with-jobs', fmtAdminNum(d.feeds_with_jobs));
    setAdminText('ah-4xx', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-jobs', fmtAdminNum(d.total_jobs));

    var net = (d.jobs_added || 0) - (d.jobs_lost || 0);
    setAdminText('ah-net', (net >= 0 ? '+' : '') + fmtAdminNum(net));

    setDelta('ah-total-delta', d.boards_added, '+');
    setDelta('ah-with-jobs-delta', null);
    setDelta('ah-4xx-delta', d.boards_lost, '+', true);
    setDelta('ah-jobs-delta', d.jobs_added, '+');
    setDelta('ah-net-delta', d.jobs_lost, '-', true);

    var healthPct = d.feed_health_pct || 0;
    var healthEl = document.getElementById('admin-health');
    if (healthEl) {
      var color = healthPct >= 80 ? 'admin-green' : healthPct >= 60 ? 'admin-amber' : 'admin-red';
      healthEl.innerHTML = '<span class="admin-health-dot ' + color + '"></span> Feed health: <strong>' + healthPct + '%</strong> of boards returning jobs';
    }

    var platform = await sb.rpc('get_board_health_by_platform', { period_hours: adminPeriod });
    if (platform.data && platform.data.length) {
      var tbody = document.getElementById('admin-platform-body');
      if (tbody) {
        tbody.innerHTML = platform.data.map(function(p) {
          return '<tr>' +
            '<td class="admin-platform-name">' + (p.platform || 'unknown') + '</td>' +
            '<td>' + fmtAdminNum(p.total) + '</td>' +
            '<td class="admin-green">+' + fmtAdminNum(p.boards_added) + '</td>' +
            '<td class="admin-red">-' + fmtAdminNum(p.boards_lost) + '</td>' +
            '<td>' + fmtAdminNum(p.with_jobs) + '</td>' +
            '<td class="' + (p.errors_4xx > 0 ? 'admin-red' : '') + '">' + p.errors_4xx + '</td>' +
            '<td>' + fmtAdminNum(p.jobs) + '</td>' +
            '<td class="admin-green">+' + fmtAdminNum(p.jobs_added) + '</td>' +
            '<td class="admin-red">-' + fmtAdminNum(p.jobs_lost) + '</td>' +
            '</tr>';
        }).join('');
      }
    }
  } catch (err) {
    console.error('[Admin] loadBoardHealth error:', err);
  }
}

function setDelta(id, val, prefix, invert) {
  var el = document.getElementById(id);
  if (!el) return;
  if (val == null || val === 0) { el.textContent = ''; return; }
  var cls = invert ? 'admin-red' : 'admin-green';
  el.innerHTML = '<span class="' + cls + '">' + (prefix || '') + fmtAdminNum(val) + '</span>';
}

// ═══════════════════════════════════════════════════════════
// TAB 2: COHORTS
// ═══════════════════════════════════════════════════════════

async function loadCohortTab() {
  console.log('[Admin] loadCohortTab');
  try {
    var res = await sb.rpc('get_cohort_overview');
    if (res.error) { console.error('[Admin] Cohort RPC error:', res.error); return; }
    var cohorts = res.data;
    if (!cohorts || !cohorts.length) {
      setAdminText('ac-total-cohorts', '0');
      setAdminText('ac-total-users', '0');
      setAdminText('ac-pro-pct', '—');
      setAdminText('ac-active-7d', '0');
      return;
    }

    var totalUsers = cohorts.reduce(function(s, c) { return s + (c.user_count || 0); }, 0);
    var totalPro = cohorts.reduce(function(s, c) { return s + (c.pro_count || 0); }, 0);
    var active7d = cohorts.reduce(function(s, c) { return s + (c.active_7d || 0); }, 0);

    setAdminText('ac-total-cohorts', cohorts.length);
    setAdminText('ac-total-users', fmtAdminNum(totalUsers));
    setAdminText('ac-pro-pct', fmtAdminPct(totalPro, totalUsers));
    setAdminText('ac-active-7d', fmtAdminNum(active7d));

    var tbody = document.getElementById('admin-cohort-body');
    if (!tbody) return;
    tbody.innerHTML = cohorts.map(function(c) {
      return '<tr class="admin-cohort-row" data-cohort-id="' + c.id + '" style="cursor:pointer">' +
        '<td class="admin-platform-name">' + c.name + ' <span style="color:var(--text-faint);font-size:10px">(' + c.slug + ')</span></td>' +
        '<td>' + fmtAdminNum(c.user_count) + '</td>' +
        '<td>' + fmtAdminNum(c.free_count) + '</td>' +
        '<td class="admin-green">' + fmtAdminNum(c.pro_count) + '</td>' +
        '<td>' + fmtAdminNum(c.active_7d) + '</td>' +
        '<td>' + fmtAdminNum(c.active_30d) + '</td>' +
        '<td>' + (c.entitlement_count || 0) + '</td>' +
        '<td>' + (c.is_locked ? '🔒' : '—') + '</td>' +
        '</tr>';
    }).join('');

    tbody.addEventListener('click', function(e) {
      var row = e.target.closest('.admin-cohort-row');
      if (!row) return;
      var cid = row.dataset.cohortId;
      var cohort = cohorts.find(function(c) { return String(c.id) === cid; });
      if (cohort) loadCohortDetail(cohort);
    });
  } catch (err) {
    console.error('[Admin] loadCohortTab error:', err);
  }
}

async function loadCohortDetail(cohort) {
  var detail = document.getElementById('admin-cohort-detail');
  var title = document.getElementById('admin-cohort-detail-title');
  var tbody = document.getElementById('admin-entitlement-body');
  if (!detail || !tbody) return;

  title.textContent = cohort.name + ' — Entitlements';
  detail.style.display = '';

  var res = await sb.from('cohort_plan_entitlements')
    .select('feature, plan, behavior, limit_value, bonus_max')
    .eq('cohort_id', cohort.id)
    .order('plan')
    .order('feature');

  if (res.error || !res.data) return;

  tbody.innerHTML = res.data.map(function(e) {
    return '<tr>' +
      '<td>' + e.feature + '</td>' +
      '<td>' + e.plan + '</td>' +
      '<td>' + e.behavior + '</td>' +
      '<td>' + (e.limit_value != null ? e.limit_value : '∞') + '</td>' +
      '<td>' + (e.bonus_max != null ? e.bonus_max : '—') + '</td>' +
      '</tr>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════
// TAB 3: USERS + SESSIONS
// ═══════════════════════════════════════════════════════════

async function loadUsersTab() {
  console.log('[Admin] loadUsersTab');
  try {
    var res = await sb.rpc('get_user_overview');
    if (res.error) { console.error('[Admin] Users RPC error:', res.error); return; }
    var d = res.data;
    if (!d) return;

    setAdminText('au-total', fmtAdminNum(d.total_users));
    setAdminText('au-active-7d', fmtAdminNum(d.active_7d));
    setAdminText('au-new-7d', fmtAdminNum(d.new_7d));
    setAdminText('au-pro', fmtAdminNum(d.pro_users));
    setAdminText('au-filters', fmtAdminNum(d.with_filters));
    setAdminText('au-resumes', fmtAdminNum(d.with_resumes));
    setAdminText('au-connections', fmtAdminNum(d.with_connections));

    // Session stats
    if (d.sessions_7d != null) {
      setAdminText('au-sessions-7d', fmtAdminNum(d.sessions_7d));
      setAdminText('au-avg-duration', d.avg_duration_min != null ? d.avg_duration_min + 'm' : '—');
      setAdminText('au-device-desktop', fmtAdminNum(d.desktop_sessions || 0));
      setAdminText('au-device-mobile', fmtAdminNum(d.mobile_sessions || 0));
    }

    // Signup chart
    if (d.signup_by_week && d.signup_by_week.length && typeof echarts !== 'undefined') {
      var chartEl = document.getElementById('admin-signup-chart');
      if (chartEl) {
        var chart = echarts.init(chartEl);
        chart.setOption({
          tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
          grid: { left: 50, right: 16, top: 12, bottom: 32 },
          xAxis: { type: 'category', data: d.signup_by_week.map(function(w) { return w.week; }), axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
          yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
          series: [{ type: 'bar', data: d.signup_by_week.map(function(w) { return w.count; }), itemStyle: { borderRadius: [4, 4, 0, 0], color: '#4d8eff' }, barWidth: '60%' }]
        });
        window.addEventListener('resize', function() { chart.resize(); });
      }
    }
  } catch (err) {
    console.error('[Admin] loadUsersTab error:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// TAB 4: SEO / DATA COVERAGE
// ═══════════════════════════════════════════════════════════
// v3.42 — 9-tool SEO dashboard, date range pickers, auth-only fetch

var _seoUrl = '';
var _seoDateFrom = '';
var _seoDateTo = '';
var _seoCharts = {};
var _seoData = {};

function setSeoUrl(url) {
  _seoUrl = url;
  loadSeoTab();
}

function seoDateChanged() {
  var from = document.getElementById('seo-date-from');
  var to = document.getElementById('seo-date-to');
  _seoDateFrom = from ? from.value : '';
  _seoDateTo = to ? to.value : '';
  loadSeoTab();
}

async function loadSeoTab() {
  console.log('[Admin] loadSeoTab url=' + (_seoUrl || 'ALL') + ' from=' + (_seoDateFrom || 'all') + ' to=' + (_seoDateTo || 'now'));
  try {
    await fetchSeoData();
    // Small delay to ensure panel is visible before chart init
    await new Promise(function(r) { setTimeout(r, 50); });
    renderSeoCharts();
    renderSeoSidePanel();
    // Resize all charts after render (handles hidden panel → visible transition)
    setTimeout(function() {
      Object.keys(_seoCharts).forEach(function(k) {
        if (_seoCharts[k]) _seoCharts[k].resize();
      });
    }, 200);
  } catch(err) { console.error('[Admin] SEO load error:', err); }
}

// ─── Data Fetching (auth-only) ───
async function fetchSeoData() {
  var hdr = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
  // Try auth session if available (for RLS-protected tables), fall back to anon key
  try {
    var session = (await sb.auth.getSession()).data.session;
    if (session) hdr = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + session.access_token };
  } catch(e) {}
  var authHeaders = hdr;

  var urlFilter = _seoUrl ? '&url=eq.' + encodeURIComponent(_seoUrl) : '';
  var dateFilter = '';
  if (_seoDateFrom) dateFilter += '&date=gte.' + _seoDateFrom;
  if (_seoDateTo) dateFilter += '&date=lte.' + _seoDateTo;

  var fetches = {
    site_daily:  fetch(SUPABASE_URL + '/rest/v1/seo_site_daily?select=*&order=date.asc' + dateFilter, { headers: authHeaders }),
    page_daily:  fetch(SUPABASE_URL + '/rest/v1/seo_page_daily?select=*&order=date.asc' + dateFilter + urlFilter, { headers: authHeaders }),
    tech_audits: fetch(SUPABASE_URL + '/rest/v1/seo_tech_audits?select=*&order=date.asc' + dateFilter + urlFilter, { headers: authHeaders }),
    index_status:fetch(SUPABASE_URL + '/rest/v1/seo_index_status?select=*&order=checked_at.desc' + (_seoUrl ? '&url=eq.' + encodeURIComponent(_seoUrl) : '') + '&limit=20', { headers: authHeaders }),
    conversions: fetch(SUPABASE_URL + '/rest/v1/seo_conversions?select=*&order=date.asc' + dateFilter, { headers: authHeaders }),
    gsc_queries: fetch(SUPABASE_URL + '/rest/v1/seo_gsc_daily?select=query,clicks,impressions,ctr,position' + dateFilter + urlFilter + '&order=clicks.desc&limit=50', { headers: authHeaders }),
  };

  var keys = Object.keys(fetches);
  var responses = await Promise.all(keys.map(function(k) { return fetches[k].then(function(r) { return r.json(); }).catch(function() { return []; }); }));
  _seoData = {};
  keys.forEach(function(k, i) { _seoData[k] = Array.isArray(responses[i]) ? responses[i] : []; });
  console.log('[Admin] SEO data loaded:', Object.keys(_seoData).map(function(k) { return k + '=' + _seoData[k].length; }).join(', '));
}

// ─── Chart Rendering ───
function renderSeoCharts() {
  renderSeoStatCards();
  renderGscChart();
  renderPsiChart();
  renderCruxChart();
  renderYltChart();
  renderCloudflareChart();
}


function renderSeoStatCards() {
  var techAudits = _seoData.tech_audits || [];
  var indexStatus = _seoData.index_status || [];
  var siteDailyArr = _seoData.site_daily || [];

  // PSI avg performance (latest mobile) — average across ALL pages
  var psiMobile = techAudits.filter(function(r) { return r.source === 'psi_mobile'; });
  var psiPerf = null;
  if (psiMobile.length) {
    var latestPsiDate = psiMobile[psiMobile.length - 1].date;
    var latestPsiPages = psiMobile.filter(function(r) { return r.date === latestPsiDate; });
    var perfSum = 0;
    latestPsiPages.forEach(function(r) { if (r.metrics) perfSum += r.metrics.performance || 0; });
    psiPerf = latestPsiPages.length ? Math.round(perfSum / latestPsiPages.length) : null;
  }

  // YLT avg
  var yltData = techAudits.filter(function(r) { return r.source === 'yellowlab'; });
  var yltAvg = yltData.length ? Math.round(yltData.reduce(function(s, r) { return s + (r.score || 0); }, 0) / yltData.length) : null;

  // Indexed pages
  var indexed = 0, totalInspected = 0;
  var seen = {};
  indexStatus.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; totalInspected++; if (r.verdict === 'PASS') indexed++; });

  // CF traffic (latest day)
  var cfData = techAudits.filter(function(r) { return r.source === 'cloudflare'; });
  var latestCf = cfData.length ? cfData[cfData.length - 1] : null;
  var cfRequests = latestCf && latestCf.metrics ? latestCf.metrics.total_requests : null;

  // GSC clicks (latest day)
  var latestSite = siteDailyArr.length ? siteDailyArr[siteDailyArr.length - 1] : null;
  var gscClicks = latestSite ? (latestSite.total_clicks || 0) : null;

  // Set values via DOM
  function setKpi(id, value, colorClass) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = value != null ? String(value) : '\u2014';
    el.className = 'stat-val';
    if (colorClass) el.classList.add(colorClass);
  }

  var psiColor = psiPerf >= 90 ? 'admin-green' : psiPerf >= 50 ? 'admin-amber' : psiPerf != null ? 'admin-red' : '';
  var yltColor = yltAvg >= 90 ? 'admin-green' : yltAvg >= 50 ? 'admin-amber' : yltAvg != null ? 'admin-red' : '';
  var idxColor = totalInspected > 0 && indexed === totalInspected ? 'admin-green' : indexed > 0 ? 'admin-amber' : totalInspected > 0 ? 'admin-red' : '';

  setKpi('seo-kpi-psi', psiPerf, psiColor);
  setKpi('seo-kpi-ylt', yltAvg, yltColor);
  setKpi('seo-kpi-indexed', totalInspected > 0 ? indexed + '/' + totalInspected : null, idxColor);
  setKpi('seo-kpi-cf', cfRequests != null ? cfRequests.toLocaleString() : null);
  setKpi('seo-kpi-gsc', gscClicks != null ? gscClicks.toLocaleString() : null);
}

function seoChartTheme() {
  return {
    grid: { top: 35, right: 20, bottom: 30, left: 50, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
  };
}

function seoAxis() {
  return {
    xAxis: { type: 'category', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, axisLine: { lineStyle: { color: '#e8eaef' } } },
    yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
  };
}

function initSeoChart(elId) {
  var el = document.getElementById(elId);
  if (!el) return null;
  if (_seoCharts[elId]) { _seoCharts[elId].dispose(); }
  _seoCharts[elId] = echarts.init(el, null, { renderer: 'canvas' });
  return _seoCharts[elId];
}

function seoNoData(chart, title, msg) {
  chart.setOption({
    title: { text: title, textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    graphic: { elements: [{ type: 'group', left: 'center', top: 'middle', children: [
      { type: 'text', left: 'center', top: -10, style: { text: msg || 'No data yet', fill: '#9ca3af', fontSize: 13, fontFamily: 'Outfit' } },
      { type: 'text', left: 'center', top: 12, style: { text: 'Run sync to populate', fill: '#d1d5db', fontSize: 11, fontFamily: 'Outfit' } }
    ] }] }
  }, true);
}

// 1. PostHog Traffic
function renderTrafficChart() {
  var chart = initSeoChart('seo-chart-traffic');
  if (!chart) return;
  var convs = _seoData.conversions || [];
  var byDate = {};
  convs.forEach(function(r) { if (r.event_type === 'pageview') byDate[r.date] = (byDate[r.date] || 0) + (r.count || 0); });
  var dates = Object.keys(byDate).sort();
  if (!dates.length) { seoNoData(chart, 'PostHog Traffic', 'No pageview data yet'); return; }
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {
    title: { text: 'PostHog Traffic', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: dates.map(function(d) { return byDate[d]; }), itemStyle: { color: '#8b5cf6' }, barMaxWidth: 16 }]
  }), true);
}

// 2. GSC
function renderGscChart() {
  var chart = initSeoChart('seo-chart-gsc');
  if (!chart) return;
  var data = _seoUrl ? (_seoData.page_daily || []) : (_seoData.site_daily || []);
  if (!data.length) { seoNoData(chart, 'Google Search Console'); return; }
  var dates = data.map(function(r) { return r.date; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {
    title: { text: 'Google Search Console', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    legend: { data: ['Clicks', 'Impressions'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Clicks', type: 'bar', data: data.map(function(r) { return r.clicks || r.total_clicks || 0; }), itemStyle: { color: '#4d8eff' }, barMaxWidth: 12 },
      { name: 'Impressions', type: 'line', yAxisIndex: 1, data: data.map(function(r) { return r.impressions || r.total_impressions || 0; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, smooth: true, symbol: 'none' }
    ]
  }), true);
}

// 3. PSI 4 categories
function renderPsiChart() {
  var chart = initSeoChart('seo-chart-psi');
  if (!chart) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { seoNoData(chart, 'PageSpeed Insights (Mobile)'); return; }

  // Logarithmic transform: compress 0-100 scale to show detail in 80-100 range
  // Use log10(101-v) inverted so higher scores get more visual space
  function psiLog(v) { if (v == null) return null; return v; }

  if (_seoUrl) {
    // Single URL time series
    var dates = audits.map(function(r) { return r.date; });
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'PageSpeed Insights (Mobile) — ' + (_seoUrl ? new URL(_seoUrl).pathname : ''), textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      legend: { data: ['Performance', 'SEO', 'Accessibility', 'Best Practices'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
      xAxis: Object.assign({}, ax.xAxis, { data: dates }),
      yAxis: Object.assign({}, ax.yAxis, { type: 'log', min: 40, max: 100, logBase: 10, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, formatter: function(v) { return Math.round(v); } } }),
      series: [
        { name: 'Performance', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.performance; }), lineStyle: { color: '#f59e0b' }, itemStyle: { color: '#f59e0b' }, symbol: 'circle', symbolSize: 6 },
        { name: 'SEO', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.seo; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, symbol: 'circle', symbolSize: 6 },
        { name: 'Accessibility', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.accessibility; }), lineStyle: { color: '#4d8eff' }, itemStyle: { color: '#4d8eff' }, symbol: 'circle', symbolSize: 6 },
        { name: 'Best Practices', type: 'line', data: audits.map(function(r) { return r.metrics && r.metrics.best_practices; }), lineStyle: { color: '#a78bfa' }, itemStyle: { color: '#a78bfa' }, symbol: 'circle', symbolSize: 6 }
      ]
    }), true);
  } else {
    // Aggregate — average across all pages for latest date
    var latestDate = audits[audits.length - 1].date;
    var latest = audits.filter(function(r) { return r.date === latestDate; });
    var avgMetrics = { performance: 0, seo: 0, accessibility: 0, best_practices: 0 };
    latest.forEach(function(r) {
      if (r.metrics) {
        avgMetrics.performance += r.metrics.performance || 0;
        avgMetrics.seo += r.metrics.seo || 0;
        avgMetrics.accessibility += r.metrics.accessibility || 0;
        avgMetrics.best_practices += r.metrics.best_practices || 0;
      }
    });
    var n = latest.length || 1;
    Object.keys(avgMetrics).forEach(function(k) { avgMetrics[k] = Math.round(avgMetrics[k] / n); });
    
    var labels = ['Performance', 'SEO', 'Accessibility', 'Best Practices'];
    var values = [avgMetrics.performance, avgMetrics.seo, avgMetrics.accessibility, avgMetrics.best_practices];
    var colors = ['#f59e0b', '#34d399', '#4d8eff', '#a78bfa'];
    var t = seoChartTheme(), ax = seoAxis();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'PSI Avg Across ' + n + ' Pages (Mobile)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 11 } },
      yAxis: Object.assign({}, ax.yAxis, { type: 'log', min: 40, max: 100, logBase: 10, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, formatter: function(v) { return Math.round(v); } } }),
      series: [{ type: 'bar', data: values.map(function(v, i) { return { value: v, itemStyle: { color: colors[i] } }; }),
        barMaxWidth: 50, itemStyle: { borderRadius: [4,4,0,0] },
        label: { show: true, position: 'top', color: '#6b7280', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, formatter: function(p) { return p.value; } } }]
    }), true);
  }
}

// 4. CrUX
function renderCruxChart() {
  var chart = initSeoChart('seo-chart-crux');
  if (!chart) return;
  var cruxData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'crux'; });
  if (!cruxData.length) { seoNoData(chart, 'Chrome UX Report', 'Not enough traffic for CrUX data yet'); return; }
  var latest = cruxData[cruxData.length - 1];
  var m = latest.metrics || {};
  var metricNames = Object.keys(m);
  var labels = metricNames.map(function(k) { return k.replace(/_/g, ' ').toUpperCase(); });
  var p75s = metricNames.map(function(k) { return m[k] && m[k].p75 ? m[k].p75 : 0; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {
    title: { text: 'Chrome UX Report (p75)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    grid: { top: 35, right: 20, bottom: 50, left: 60 },
    xAxis: { type: 'category', data: labels, axisLabel: { color: '#7b829a', fontSize: 9, rotate: 30 } },
    yAxis: ax.yAxis,
    series: [{ type: 'bar', data: p75s, itemStyle: { color: function(p) { return ['#34d399','#4d8eff','#f59e0b','#a78bfa','#ef4444'][p.dataIndex % 5]; } }, barMaxWidth: 30 }]
  }), true);
}

// 5. Yellow Lab Tools
function renderYltChart() {
  var chart = initSeoChart('seo-chart-ylt');
  if (!chart) return;
  var yltData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'yellowlab'; });
  if (!yltData.length) { seoNoData(chart, 'Yellow Lab Tools'); return; }

  if (_seoUrl) {
    // Single URL: category scores over time
    var pageData = yltData.filter(function(r) { return r.url === _seoUrl; });
    if (!pageData.length) { seoNoData(chart, 'YLT — no data for this URL'); return; }
    var dates = pageData.map(function(r) { return r.date; });
    var catKeys = pageData[0].metrics && pageData[0].metrics.categories ? Object.keys(pageData[0].metrics.categories) : [];
    var catColors = ['#eab308','#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ec4899','#6366f1','#ef4444','#14b8a6'];
    var t = seoChartTheme(), ax = seoAxis();
    var series = catKeys.map(function(k, i) {
      var label = pageData[0].metrics.categories[k].label || k;
      return { name: label, type: 'line', data: pageData.map(function(r) {
        return r.metrics && r.metrics.categories && r.metrics.categories[k] ? r.metrics.categories[k].score : null;
      }), lineStyle: { color: catColors[i % catColors.length] }, itemStyle: { color: catColors[i % catColors.length] }, symbol: 'circle', symbolSize: 4 };
    });
    chart.setOption(Object.assign({}, t, {
      title: { text: 'YLT Category Scores', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      legend: { data: series.map(function(s) { return s.name; }), textStyle: { color: '#7b829a', fontSize: 9 }, top: 4, right: 10, type: 'scroll' },
      xAxis: Object.assign({}, ax.xAxis, { data: dates }),
      yAxis: Object.assign({}, ax.yAxis, { min: 0, max: 100 }),
      series: series
    }), true);
  } else {
    // All Pages: blended average score + category radar
    var latestDate = yltData[yltData.length - 1].date;
    var latest = yltData.filter(function(r) { return r.date === latestDate; });
    var avgScore = Math.round(latest.reduce(function(s, r) { return s + (r.score || 0); }, 0) / (latest.length || 1));
    
    // Aggregate categories across all pages
    var catTotals = {}, catCount = 0;
    latest.forEach(function(r) {
      if (r.metrics && r.metrics.categories) {
        catCount++;
        Object.keys(r.metrics.categories).forEach(function(k) {
          var cat = r.metrics.categories[k];
          if (!catTotals[k]) catTotals[k] = { label: cat.label || k, total: 0, count: 0 };
          catTotals[k].total += cat.score || 0;
          catTotals[k].count++;
        });
      }
    });
    
    var catEntries = Object.values(catTotals).map(function(c) {
      return { name: c.label, value: Math.round(c.total / c.count) };
    });
    
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'YLT Avg: ' + avgScore + '/100 (' + latest.length + ' pages)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      radar: {
        indicator: catEntries.map(function(c) { return { name: c.name, max: 100 }; }),
        shape: 'polygon',
        axisName: { color: '#7b829a', fontSize: 9 },
        splitArea: { areaStyle: { color: ['rgba(59,130,246,0.02)', 'rgba(59,130,246,0.04)'] } },
        splitLine: { lineStyle: { color: '#e8eaef' } },
        axisLine: { lineStyle: { color: '#e8eaef' } }
      },
      series: [{ type: 'radar', data: [{
        value: catEntries.map(function(c) { return c.value; }),
        name: 'Avg Score',
        lineStyle: { color: '#eab308', width: 2 },
        itemStyle: { color: '#eab308' },
        areaStyle: { color: 'rgba(234,179,8,0.15)' }
      }] }],
      tooltip: { trigger: 'item', formatter: function(p) {
        var lines = catEntries.map(function(c, i) { return c.name + ': ' + p.value[i]; });
        return '<b>Avg across ' + catCount + ' pages</b><br/>' + lines.join('<br/>');
      } }
    }), true);
  }
}

// 6. Cloudflare
function renderCloudflareChart() {
  var chart = initSeoChart('seo-chart-cf');
  if (!chart) return;
  var cfData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'cloudflare'; });
  if (!cfData.length) { seoNoData(chart, 'Cloudflare Traffic'); return; }
  var dates = cfData.map(function(r) { return r.date; });
  var t = seoChartTheme(), ax = seoAxis();
  chart.setOption(Object.assign({}, t, {
    title: { text: 'Cloudflare', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
    legend: { data: ['Requests', 'Page Views', 'Uniques'], textStyle: { color: '#7b829a', fontSize: 10 }, top: 4, right: 10 },
    grid: { top: 35, right: 60, bottom: 30, left: 50 },
    xAxis: Object.assign({}, ax.xAxis, { data: dates }),
    yAxis: [ax.yAxis, { type: 'value', axisLabel: { color: '#7b829a', fontSize: 10 }, splitLine: { show: false } }],
    series: [
      { name: 'Requests', type: 'bar', data: cfData.map(function(r) { return r.metrics && r.metrics.total_requests || 0; }), itemStyle: { color: 'rgba(77,142,255,0.3)' }, barMaxWidth: 16 },
      { name: 'Page Views', type: 'line', data: cfData.map(function(r) { return r.metrics && r.metrics.page_views || 0; }), lineStyle: { color: '#f97316' }, itemStyle: { color: '#f97316' }, symbol: 'circle', symbolSize: 5 },
      { name: 'Uniques', type: 'line', yAxisIndex: 1, data: cfData.map(function(r) { return r.metrics && r.metrics.unique_visitors || 0; }), lineStyle: { color: '#34d399' }, itemStyle: { color: '#34d399' }, symbol: 'circle', symbolSize: 5 }
    ]
  }), true);
}

// ─── Side Panel ───
function renderSeoSidePanel() {
  renderUrlInspection();
  renderGscQueries();
  renderPsiDrilldown();
  renderDfsAudit();
  renderKnowledgeGraph();
}

function renderUrlInspection() {
  var el = document.getElementById('seo-side-inspection');
  if (!el) return;
  var data = _seoData.index_status || [];
  if (!data.length) {
    el.innerHTML = '<div class="seo-empty">No inspection data yet. Requires Google Service Account key.<br><a href="#" onclick="triggerSeoSync([&#39;gsc_inspect&#39;]);return false;">Run inspection</a></div>';
    return;
  }

  if (_seoUrl) {
    var latest = data.find(function(r) { return r.url === _seoUrl; }) || data[0];
    var vc = latest.verdict === 'PASS' ? 'admin-green' : latest.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
    el.innerHTML =
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Verdict</span> <span class="seo-metric-value ' + vc + '">' + (latest.verdict || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Coverage</span> <span class="seo-metric-value">' + (latest.coverage_state || '\u2014') + '</span></div>' +
      '</div>' +
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Indexing</span> <span class="seo-metric-value">' + (latest.indexing_state || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Last Crawl</span> <span class="seo-metric-value">' + (latest.last_crawl_time ? new Date(latest.last_crawl_time).toLocaleDateString() : '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Mobile</span> <span class="seo-metric-value">' + (latest.mobile_usability || '\u2014') + '</span></div>' +
      '</div>';
  } else {
    // All pages: show horizontal bar chart of verdict per URL
    var seen = {}, rows = [];
    data.forEach(function(r) { if (seen[r.url]) return; seen[r.url] = true; rows.push(r); });
    
    var pass = 0, fail = 0, other = 0;
    rows.forEach(function(r) { if (r.verdict === 'PASS') pass++; else if (r.verdict === 'FAIL' || r.verdict === 'ERROR') fail++; else other++; });
    
    var chartHtml = '<div style="margin-bottom:12px;display:flex;gap:16px;">' +
      '<div><span class="seo-metric-value admin-green" style="font-size:18px;">' + pass + '</span> <span class="seo-metric-label">indexed</span></div>' +
      '<div><span class="seo-metric-value admin-amber" style="font-size:18px;">' + other + '</span> <span class="seo-metric-label">pending</span></div>' +
      '<div><span class="seo-metric-value admin-red" style="font-size:18px;">' + fail + '</span> <span class="seo-metric-label">failed</span></div>' +
    '</div>';
    
    // Per-URL status table
    chartHtml += '<div style="max-height:200px;overflow-y:auto;">';
    chartHtml += '<table class="admin-platform-table" style="font-size:11px;"><thead><tr><th>URL</th><th>Status</th><th>Coverage</th></tr></thead><tbody>';
    rows.forEach(function(r) {
      var path = '/';
      try { path = new URL(r.url).pathname || '/'; } catch(e) {}
      var vc = r.verdict === 'PASS' ? 'admin-green' : r.verdict === 'NEUTRAL' ? 'admin-amber' : 'admin-red';
      chartHtml += '<tr><td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + path + '</td>' +
        '<td class="' + vc + '">' + (r.verdict || '—') + '</td>' +
        '<td style="font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;">' + (r.coverage_state || '—') + '</td></tr>';
    });
    chartHtml += '</tbody></table></div>';
    el.innerHTML = chartHtml;
  }
}

function renderGscQueries() {
  var el = document.getElementById('seo-side-queries');
  if (!el) return;
  var queries = _seoData.gsc_queries || [];
  if (!queries.length) { el.innerHTML = '<div class="seo-empty">No search queries yet</div>'; return; }
  var qMap = {};
  queries.forEach(function(r) { if (!r.query) return; if (!qMap[r.query]) qMap[r.query] = { clicks:0, impressions:0, position:0, count:0 }; qMap[r.query].clicks += r.clicks||0; qMap[r.query].impressions += r.impressions||0; qMap[r.query].position += r.position||0; qMap[r.query].count++; });
  var sorted = Object.entries(qMap).sort(function(a,b) { return b[1].clicks - a[1].clicks; }).slice(0,20);
  el.innerHTML = '<table class="admin-platform-table"><thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>Avg Position</th></tr></thead><tbody>' +
    sorted.map(function(e) {
      var q = e[0], d = e[1];
      var pos = d.count > 0 ? (d.position / d.count).toFixed(1) : '\u2014';
      return '<tr><td class="admin-platform-name" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + q + '</td>' +
        '<td class="admin-green">' + d.clicks + '</td>' +
        '<td>' + d.impressions + '</td>' +
        '<td>' + pos + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function renderKnowledgeGraph() {
  var el = document.getElementById('seo-side-kg');
  if (!el) return;
  var kgData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'knowledge_graph'; });
  if (!kgData.length) { el.innerHTML = '<div class="seo-empty">No Knowledge Graph data yet</div>'; return; }
  var entities = (kgData[kgData.length-1].metrics && kgData[kgData.length-1].metrics.entities) || [];
  if (!entities.length) { el.innerHTML = '<div class="seo-empty">No entities found</div>'; return; }
  el.innerHTML = entities.map(function(e) {
    return '<div class="seo-entity-row">' +
      '<span class="seo-entity-name">' + (e.name || '\u2014') + '</span>' +
      '<span class="seo-entity-type">' + (e.type || '') + '</span>' +
      (e.score ? '<span class="seo-entity-score">' + e.score.toFixed(1) + '</span>' : '') +
    '</div>';
  }).join('');
}

function renderPsiDrilldown() {
  var el = document.getElementById('seo-side-psi');
  if (!el) return;
  var audits = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'psi_mobile'; });
  if (!audits.length) { el.innerHTML = '<div class="seo-empty">No PSI data yet</div>'; return; }
  var latest = audits[audits.length-1];
  var issues = latest.issues || [];
  var m = latest.metrics || {};
  var vitals = [
    { label:'FCP', val:m.fcp?(m.fcp/1000).toFixed(2)+'s':'\u2014', good:m.fcp<1800 },
    { label:'LCP', val:m.lcp?(m.lcp/1000).toFixed(2)+'s':'\u2014', good:m.lcp<2500 },
    { label:'CLS', val:m.cls!=null?m.cls.toFixed(3):'\u2014', good:m.cls<0.1 },
    { label:'TBT', val:m.tbt!=null?Math.round(m.tbt)+'ms':'\u2014', good:m.tbt<200 },
  ];
  var html = '<div class="seo-metric-row" style="gap:24px;">';
  vitals.forEach(function(v) {
    html += '<div class="seo-vital"><div class="seo-vital-value ' + (v.good ? 'admin-green' : 'admin-red') + '">' + v.val + '</div><div class="seo-vital-label">' + v.label + '</div></div>';
  });
  html += '</div>';
  if (issues.length > 0) {
    html += '<div class="seo-issue-list">' + issues.slice(0,8).map(function(i) {
      return '<div class="seo-issue-item">' + (i.title || i.id) + '</div>';
    }).join('') + '</div>';
  } else {
    html += '<div class="seo-metric-row"><span class="seo-metric-value admin-green">\u2713 No issues flagged</span></div>';
  }
  el.innerHTML = html;
}


// ─── DataForSEO On-Page Audit ───
function renderDfsAudit() {
  var el = document.getElementById('seo-side-dfs');
  if (!el) return;
  var dfsData = (_seoData.tech_audits || []).filter(function(r) { return r.source === 'dataforseo'; });
  if (!dfsData.length) { el.innerHTML = '<div class="seo-empty">No DataForSEO data yet \u2014 <a href="#" onclick="triggerSeoSync([&#39;dataforseo&#39;]);return false;">run sync</a></div>'; return; }

  if (_seoUrl) {
    var latest = dfsData.filter(function(r) { return r.url === _seoUrl; });
    latest = latest.length ? latest[latest.length - 1] : dfsData[dfsData.length - 1];
    var m = latest.metrics || {};
    var issues = latest.issues || [];
    var sc = latest.score || 0;
    var scColor = sc >= 90 ? 'admin-green' : sc >= 50 ? 'admin-amber' : 'admin-red';
    el.innerHTML =
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Score</span> <span class="seo-metric-value ' + scColor + '">' + (sc || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Title</span> <span class="seo-metric-value">' + (m.title_length || '\u2014') + ' chars</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Desc</span> <span class="seo-metric-value">' + (m.description_length || '\u2014') + ' chars</span></div>' +
      '</div>' +
      '<div class="seo-metric-row">' +
        '<div class="seo-metric-item"><span class="seo-metric-label">H1s</span> <span class="seo-metric-value">' + (m.h1_count || 0) + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Int Links</span> <span class="seo-metric-value">' + (m.internal_links || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Ext Links</span> <span class="seo-metric-value">' + (m.external_links || '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Size</span> <span class="seo-metric-value">' + (m.page_size ? Math.round(m.page_size/1024) + 'KB' : '\u2014') + '</span></div>' +
        '<div class="seo-metric-item"><span class="seo-metric-label">Load</span> <span class="seo-metric-value">' + (m.load_time ? m.load_time.toFixed(2) + 's' : '\u2014') + '</span></div>' +
      '</div>' +
      (issues.length > 0 ? '<div class="seo-issue-list">' + issues.slice(0,8).map(function(i) { return '<div class="seo-issue-item">' + (i.message || i.check || '\u2014') + '</div>'; }).join('') + '</div>' : '<div class="seo-metric-row"><span class="seo-metric-value admin-green">\u2713 No issues</span></div>');
  } else {
    // Aggregate — show table of latest scores
    var latestDate = dfsData[dfsData.length - 1].date;
    var latest = dfsData.filter(function(r) { return r.date === latestDate; });
    el.innerHTML = '<table class="admin-platform-table"><thead><tr><th>Page</th><th>Score</th><th>Size</th><th>Links</th><th>Issues</th></tr></thead><tbody>' +
      latest.map(function(r) {
        var m = r.metrics || {};
        var path = '/';
        try { path = new URL(r.url).pathname || '/'; } catch(e) {}
        var sc = r.score || 0;
        var scColor = sc >= 90 ? 'admin-green' : sc >= 50 ? 'admin-amber' : 'admin-red';
        return '<tr><td class="admin-platform-name" style="font-family:var(--mono)!important;">' + path + '</td>' +
          '<td class="' + scColor + '" style="font-weight:600;">' + sc + '</td>' +
          '<td>' + (m.page_size ? Math.round(m.page_size/1024) + 'KB' : '\u2014') + '</td>' +
          '<td>' + ((m.internal_links||0) + (m.external_links||0)) + '</td>' +
          '<td>' + (Array.isArray(r.issues) ? r.issues.length : 0) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
}

// ─── Sync Trigger ───
async function triggerSeoSync(tasks) {
  var btn = document.getElementById('seo-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Syncing\u2026'; }
  try {
    var session = (await sb.auth.getSession()).data.session;
    if (!session) { alert('Sign in required'); return; }
    var resp = await fetch(SUPABASE_URL + '/functions/v1/seo-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token, 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ tasks: tasks || ['all'] })
    });
    var data = await resp.json();
    console.log('[Admin] SEO sync result:', data);
    if (btn) btn.textContent = 'Done \u2713';
    setTimeout(function() { if (btn) { btn.disabled = false; btn.textContent = '\u21BB Sync All'; } }, 2000);
    _adminTabInit['seo'] = false;
    loadSeoTab();
  } catch(err) {
    console.error('[Admin] SEO sync error:', err);
    if (btn) { btn.disabled = false; btn.textContent = '\u21BB Sync All'; }
    alert('Sync failed: ' + err.message);
  }
}


// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// TAB 5: REVENUE
// ═══════════════════════════════════════════════════════════

async function loadRevenueTab() {
  console.log('[Admin] loadRevenueTab');
  try {
    var res = await sb.rpc('get_revenue_overview');
    if (res.error) { console.error('[Admin] Revenue RPC error:', res.error); return; }
    var d = res.data;
    if (!d) return;

    setAdminText('ar-total', fmtAdminNum(d.total_users));
    setAdminText('ar-pro', fmtAdminNum(d.pro_users));
    setAdminText('ar-conversion', d.conversion_rate != null ? d.conversion_rate + '%' : '0%');
    var mrr = (d.pro_users || 0) * 29;
    setAdminText('ar-mrr', '$' + fmtAdminNum(mrr));

    var plans = d.plan_distribution || [];
    var total = d.total_users || 1;
    var tbody = document.getElementById('admin-plan-body');
    if (tbody) {
      tbody.innerHTML = plans.map(function(p) {
        return '<tr><td class="admin-platform-name">' + (p.plan || 'free') + '</td>' +
          '<td>' + fmtAdminNum(p.count) + '</td>' +
          '<td>' + Math.round(p.count / total * 100) + '%</td></tr>';
      }).join('');
    }
  } catch (err) {
    console.error('[Admin] loadRevenueTab error:', err);
  }
}


// === js/app.js ===
const BJ_VERSION = 'v3.68';
console.log('[BJ] Dashboard ' + BJ_VERSION + ' loaded — perf: deferred scripts, inline admin check');

// Auth
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }
  currentUser = session.user;
  // Persist account flag for landing page segment detection (survives logout)
  localStorage.setItem('bj_has_account', 'true');
  const vEl = document.getElementById('nav-version');
  if (vEl) vEl.textContent = BJ_VERSION;
  let profile = null;
  try {
    const { data: p } = await sb.from('profiles').select('approved,cohort_id,plan,role').eq('id', currentUser.id).single();
    profile = p;
    if (!p?.approved) { window.location.href = '/?pending=1'; return; }
    currentUser._cohortId = p.cohort_id || null;
    window._bjUserPlan = p.plan || 'free';
  } catch (e) {}
  $('#auth-gate').style.display = 'none';
  $('#app').style.display = 'flex';
  // Show admin nav immediately — profile already fetched, no extra round trip
  if (profile && profile.role === 'admin') {
    var navAdmin = document.getElementById('nav-admin');
    if (navAdmin) { navAdmin.style.display = ''; console.log('[Admin] \u2713 Nav shown'); }
  }
  // Re-apply active page (tab restore ran while #app was hidden)
  const activeTab = localStorage.getItem('bj_active_tab');
  if (activeTab && $(`#page-${activeTab}`)) {
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${activeTab}`).classList.add('active');
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === activeTab));
  }
  $('#nav-email').textContent = currentUser.email;
  $('#nav-avatar').textContent = currentUser.email.charAt(0).toUpperCase();
  // Sync user data from Supabase → localStorage on login
  await loadUserData(currentUser.id);
  // Session analytics — Phase B
  const bjSessionId = await initSession();
  if (bjSessionId && window.posthog) {
    posthog.register({
      bj_session_id: bjSessionId,
      bj_cohort_id: currentUser._cohortId || null,
      bj_plan_id: window._bjUserPlan || 'free'
    });
  }
  // Re-init admin page if it was the active tab (tab restore runs before auth)
  if (typeof initAdminPage === 'function') initAdminPage();
  // Re-hydrate globals from potentially updated localStorage
  savedFilters = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  tuningSettings = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
  tuningLocExclPills = tuningSettings.locationExcludes || [];
  tuningTitleExclPills = tuningSettings.titleExcludes || [];
  tuningCoExclPills = tuningSettings.companyExcludes || [];
  tuningIndExclPills = tuningSettings.industryExcludes || [];
  levelHierarchy = tuningSettings.levelHierarchy || [];
  hiddenJobIds = JSON.parse(localStorage.getItem('bj_hidden_jobs') || '[]');
  savedJobIds = JSON.parse(localStorage.getItem('bj_saved_jobs') || '[]');
  appliedJobIds = JSON.parse(localStorage.getItem('bj_applied_jobs') || '[]');
  resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');
  // Trigger sparkle flourish
  setTimeout(() => { $('#nav-brand').classList.add('sparkle-active'); }, 100);
  loadStats();
  checkExtensionStatus();
  loadCollections();
  // Start session heartbeat
  if (bjSessionId) {
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        sb.rpc('session_heartbeat', { p_session_id: bjSessionId });
      }
    }, 5 * 60 * 1000);
  }
}

// Session analytics — create or reuse session
async function initSession() {
  const existing = sessionStorage.getItem('bj_session_id');
  if (existing) {
    sb.rpc('session_heartbeat', { p_session_id: existing });
    return existing;
  }
  const deviceType = window.innerWidth < 768 ? 'mobile' :
                     window.innerWidth < 1024 ? 'tablet' : 'desktop';
  const params = new URLSearchParams(window.location.search);
  const referralSource = params.get('utm_source') || params.get('ref') || 'direct';
  const entryPage = window.location.pathname;
  try {
    const { data: sessionId, error } = await sb.rpc('create_session', {
      p_user_id: currentUser.id,
      p_device_type: deviceType,
      p_referral_source: referralSource,
      p_entry_page: entryPage,
      p_metadata: {}
    });
    if (error) { console.error('[BJ] Session init error:', error); return null; }
    sessionStorage.setItem('bj_session_id', sessionId);
    return sessionId;
  } catch (e) {
    console.error('[BJ] Session init error:', e);
    return null;
  }
}

init();

// Extension detection — check last_scan_at from profiles
// Nav
$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    // Brilliant sparkle flourish
    item.classList.remove('tab-flash');
    void item.offsetWidth; // force reflow to restart animation
    item.classList.add('tab-flash');
    // Spawn sparkle dots + stars
    const rect = item.getBoundingClientRect();
    const navRect = item.offsetParent?.getBoundingClientRect() || rect;
    for (let i = 0; i < 5; i++) {
      const dot = document.createElement('div');
      dot.className = 'tab-sparkle';
      const size = 2 + Math.random() * 4;
      dot.style.width = size + 'px';
      dot.style.height = size + 'px';
      dot.style.top = (Math.random() * rect.height) + 'px';
      dot.style.left = (20 + Math.random() * (rect.width - 30)) + 'px';
      dot.style.animationDelay = (Math.random() * 0.3) + 's';
      item.appendChild(dot);
      setTimeout(() => dot.remove(), 900);
    }
    for (let i = 0; i < 2; i++) {
      const star = document.createElement('div');
      star.className = 'tab-star';
      star.textContent = i % 2 === 0 ? '✦' : '✧';
      star.style.top = (4 + Math.random() * (rect.height - 12)) + 'px';
      star.style.left = (30 + Math.random() * (rect.width - 50)) + 'px';
      star.style.animationDelay = (0.1 + Math.random() * 0.3) + 's';
      item.appendChild(star);
      setTimeout(() => star.remove(), 1000);
    }
    setTimeout(() => item.classList.remove('tab-flash'), 1000);
    $$('.page').forEach(p => p.classList.remove('active'));
    $(`#page-${item.dataset.page}`).classList.add('active');
    // Persist active tab
    localStorage.setItem('bj_active_tab', item.dataset.page);
    // Init stats charts when stats tab is shown
    if (item.dataset.page === 'stats' && typeof initStatsPage === 'function') initStatsPage();
    if (item.dataset.page === 'admin' && typeof initAdminPage === 'function') initAdminPage();
    // Close help panel on page switch
    const hp = $('#page-help-panel'); if (hp) hp.style.display = 'none';
  });
});

// Restore last active tab on load
const lastTab = localStorage.getItem('bj_active_tab');
if (lastTab && $(`#page-${lastTab}`)) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${lastTab}`).classList.add('active');
  $$('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === lastTab);
  });
  if (lastTab === 'admin' && typeof initAdminPage === 'function') initAdminPage();
  if (lastTab === 'stats' && typeof initStatsPage === 'function') initStatsPage();
}

// Extension detection — check if extension has updated the profile recently
const _helpContent = {
  feed: { title: 'Jobs Feed', steps: [
    'Check one or more saved filters in the sidebar to search jobs.',
    'Shift+click column headers for multi-column sorting.',
    'Click a job title to open the full description and apply.',
    'Colored number badges show which filter matched each job.',
    'Use the keyword insights panel to see term frequency and resume match scores.',
  ]},
  tuning: { title: 'Search Tuning', steps: [
    'Set global rules that apply across ALL your saved filters.',
    'Location rules: US-only toggle and city/country exclusions.',
    'Title exclusions: remove common false positives (e.g. "intern").',
    'Company exclusions: block specific employers or industries.',
    'Level hierarchy: define seniority levels and their keywords for automatic job ranking.',
  ]},
  pipeline: { title: 'Pipeline', steps: [
    'Track every job from saved through offer/rejection.',
    'Click stage headers to collapse/expand sections.',
    'Use the Move dropdown on any row to advance jobs through stages.',
    'Stats at top show response rates and days-to-response.',
    'Filter by saved filter using the dropdown above the stages.',
  ]},
  resumes: { title: 'Resumes', steps: [
    'Upload a resume for each role type or seniority level you target.',
    'Assign a level (Director, Manager, etc.) to each resume.',
    'Click filter pills on each card to assign resumes to your saved filters.',
    'When you apply, the matching resume is automatically selected.',
    'Keyword extraction shows how well each resume matches job descriptions.',
  ]},
  applications: { title: 'Applications', steps: [
    'Queue tab: manage pending applications (manual add, batch process).',
    'Rules tab: set default application mode (Manual, Notify, Auto) and auto-apply rules.',
    'Notifications tab: configure email/SMS preferences for every alert type.',
    'Verify your phone to unlock SMS notifications and escalation.',
    'Set escalation rules: unanswered emails auto-escalate to SMS after your timeout.',
    'Override notification settings per saved filter for targeted control.',
    'History tab: full audit trail of applications and notification delivery log.',
  ]},
  ghost: { title: 'Ghost Monitor', steps: [
    'Coming soon: Track which companies view your profile after applying.',
    'See who\'s ghosting you and who\'s actively reviewing your application.',
    'Get notified when a company shows interest.',
  ]},
  stats: { title: 'Stats', steps: [
    'View aggregated analytics across all your job search activity.',
    'Track application volume, response rates, and pipeline velocity.',
    'Compare performance across different filters and resume versions.',
  ]},
  setup: { title: 'Setup', steps: [
    'Connect the Chrome extension to scan your LinkedIn network.',
    'Your connections are matched against our job database.',
    'Jobs where you have an inside contact are flagged for priority.',
  ]},
  settings: { title: 'Settings', steps: [
    'Manage your account, notification preferences, and data.',
    'Export or delete your data at any time.',
  ]},
  subscription: { title: 'Subscription', steps: [
    'View your current plan and usage.',
    'Upgrade to Pro for auto-apply, advanced analytics, and more.',
  ]},
};

window.togglePageHelp = function(helpId) {
  const panel = $('#page-help-panel');
  if (!panel) return;
  if (!helpId || panel.style.display !== 'none' && panel.dataset.active === helpId) {
    panel.style.display = 'none';
    panel.dataset.active = '';
    return;
  }
  const content = _helpContent[helpId];
  if (!content) return;
  $('#help-panel-title').textContent = content.title;
  $('#help-panel-body').innerHTML = content.steps.map((s, i) =>
    `<div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start;">
      <span style="width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</span>
      <span>${s}</span>
    </div>`
  ).join('');
  panel.style.display = '';
  panel.dataset.active = helpId;
};

// Close help on outside click
document.addEventListener('click', e => {
  const panel = $('#page-help-panel');
  if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && !e.target.classList.contains('page-how-link')) {
    panel.style.display = 'none';
  }
});

// Extension detection — check if extension has updated the profile recently
async function checkExtensionStatus() {
  try {
    const { data: profile } = await sb.from('profiles')
      .select('last_scan_at, scanner_running, scanner_today_visited, scanner_today_limit')
      .eq('id', currentUser.id).single();

    const navDot = $('#ext-status-dot');
    const dot = $('#ext-dot');
    const text = $('#ext-status-text');
    const detail = $('#ext-status-detail');

    if (profile?.last_scan_at) {
      const lastScan = new Date(profile.last_scan_at);
      const hoursSince = (Date.now() - lastScan.getTime()) / 3600000;
      const isActive = hoursSince < 24 || profile.scanner_running;

      // Nav dot
      if (navDot) {
        if (isActive) { navDot.classList.add('connected'); navDot.title = 'Extension active'; }
        else { navDot.classList.remove('connected'); navDot.title = 'Extension not detected'; }
      }

      // Setup page status
      if (dot && text && detail) {
        if (isActive) {
          dot.className = 'ext-dot on';
          text.textContent = 'Extension connected';
          const timeStr = lastScan.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const todayStr = lastScan.toDateString() === new Date().toDateString() ? 'today' : lastScan.toLocaleDateString([], { month: 'short', day: 'numeric' });
          detail.textContent = profile.scanner_running
            ? `Active now · last synced at ${timeStr}`
            : `Last active ${todayStr} at ${timeStr}`;
        } else {
          dot.className = 'ext-dot off';
          text.textContent = 'Extension inactive';
          detail.textContent = `Last seen ${lastScan.toLocaleDateString([], { month: 'short', day: 'numeric' })} — open Chrome to reconnect`;
        }
      }
    }
  } catch (e) { /* ignore */ }
}
checkExtensionStatus();
setInterval(checkExtensionStatus, 60000);

// Saved Jobs card → navigate to Pipeline
$('#j-saved-card').addEventListener('click', () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const pipelineNav = $('[data-page="pipeline"]');
  if (pipelineNav) {
    pipelineNav.classList.add('active');
    pipelineNav.classList.remove('tab-flash');
    void pipelineNav.offsetWidth;
    pipelineNav.classList.add('tab-flash');
    setTimeout(() => pipelineNav.classList.remove('tab-flash'), 1000);
  }
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-pipeline').classList.add('active');
});

// Download
$('#download-btn').addEventListener('click', async () => {
  const btn = $('#download-btn');
  const status = $('#download-status');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Preparing download...';
  status.textContent = '';
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch('/api/build-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Failed (${res.status})`); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'brilliant-jobs-extension.zip';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    status.textContent = 'Download started. Follow the installation guide below.';
    const instanceId = res.headers.get('X-Instance-Id') || 'bj-' + Math.random().toString(36).slice(2, 10);
    $('#instance-card').style.display = 'block';
    $('#ext-instance-id').textContent = instanceId;
    $('#ext-built-at').textContent = new Date().toLocaleDateString();
  } catch (e) { status.textContent = 'Error: ' + e.message; }
  btn.disabled = false; btn.textContent = 'Download Extension';
});





