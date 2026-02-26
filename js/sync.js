// ============================================================
// UNIFIED SYNC LAYER — Supabase = source of truth, localStorage = cache
// v4.95 — Replaces ad-hoc per-module sync with consistent pattern
// ============================================================

/**
 * Architecture:
 * 1. On load: fetch from Supabase → write to localStorage → hydrate globals
 * 2. On mutation: write to Supabase first → update localStorage → update globals
 * 3. If localStorage is empty on any page: auto-rehydrate from Supabase
 * 4. Offline fallback: if Supabase unreachable, use localStorage + queue writes
 *
 * Sync Registry maps each data domain to:
 *   - lsKey: localStorage key
 *   - globalVar: name of the global variable to hydrate
 *   - default: default value if both sources empty
 *   - cloudSource: 'profiles' (user_data JSONB) or table name for dedicated tables
 *   - shortKey: key within profiles.user_data (if cloudSource = 'profiles')
 */

const SYNC_REGISTRY = {
  saved_filters: {
    lsKey: 'bj_saved_filters',
    globalVar: 'savedFilters',
    default: [],
    cloudSource: 'user_filters',  // dedicated table (primary) + profiles.user_data (backup)
    shortKey: 'saved_filters',
  },
  resumes: {
    lsKey: 'bj_resumes',
    globalVar: 'resumes',
    default: [],
    cloudSource: 'profiles',
    shortKey: 'resumes',
  },
  tuning: {
    lsKey: 'bj_tuning',
    globalVar: 'tuningSettings',
    default: {},
    cloudSource: 'user_tuning',  // dedicated table + profiles.user_data backup
    shortKey: 'tuning',
  },
  hidden_jobs: {
    lsKey: 'bj_hidden_jobs',
    globalVar: 'hiddenJobIds',
    default: [],
    cloudSource: 'profiles',
    shortKey: 'hidden_jobs',
  },
  readiness: {
    lsKey: 'bj_readiness',
    globalVar: 'readinessCache',
    default: {},
    cloudSource: 'profiles',
    shortKey: 'readiness',
  },
};

// Track domains that need a cloud write
let _syncDirty = new Set();
let _syncFlushTimer = null;

/**
 * Check if a value is "empty" (null, undefined, empty array, empty object)
 */
function _isEmpty(val) {
  if (val == null) return true;
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

/**
 * Read from localStorage with JSON parsing and fallback
 */
function _readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

/**
 * Write to localStorage with size guard
 */
function _writeLS(key, val) {
  try {
    const str = JSON.stringify(val);
    const bytes = new Blob([str]).size;
    if (bytes > 2 * 1024 * 1024) {
      console.error('[sync] Rejected: ' + key + ' is ' + Math.round(bytes / 1024) + 'KB (>2MB)');
      return false;
    }
    localStorage.setItem(key, str);
    return true;
  } catch (e) {
    console.error('[sync] localStorage write failed:', key, e.message);
    return false;
  }
}

/**
 * Hydrate a global variable from a value
 */
function _hydrateGlobal(reg, val) {
  try {
    window[reg.globalVar] = val;
  } catch (e) {
    console.warn('[sync] Failed to hydrate', reg.globalVar, e.message);
  }
}

/**
 * CORE: Ensure a domain has data — checks localStorage, falls back to Supabase
 * Called on page load and whenever a module detects empty state.
 * Returns the value (from localStorage or cloud).
 */
async function syncEnsure(domainKey) {
  const reg = SYNC_REGISTRY[domainKey];
  if (!reg) { console.warn('[sync] Unknown domain:', domainKey); return null; }

  // Step 1: Check localStorage
  const localVal = _readLS(reg.lsKey, null);
  if (!_isEmpty(localVal)) {
    _hydrateGlobal(reg, localVal);
    return localVal;
  }

  // Step 2: localStorage is empty — try Supabase
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) {
    console.log('[sync] No auth for cloud fetch of', domainKey);
    _hydrateGlobal(reg, reg.default);
    return reg.default;
  }

  console.log('[sync] localStorage empty for', domainKey, '— fetching from cloud');
  try {
    let cloudVal = null;

    // Try dedicated table first (if applicable)
    if (reg.cloudSource === 'user_filters') {
      const { data, error } = await sb.from('user_filters')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('sort_order');
      if (!error && data && data.length > 0) {
        cloudVal = data.map(f => ({ ...f.filter_data, _id: f.id, name: f.name }));
      }
    } else if (reg.cloudSource === 'user_tuning') {
      const { data, error } = await sb.from('user_tuning')
        .select('tuning_data')
        .eq('user_id', currentUser.id)
        .single();
      if (!error && data?.tuning_data && Object.keys(data.tuning_data).length > 0) {
        cloudVal = data.tuning_data;
      }
    }

    // Fallback to profiles.user_data for all domains
    if (_isEmpty(cloudVal)) {
      const { data: prof, error } = await sb.from('profiles')
        .select('user_data')
        .eq('id', currentUser.id)
        .single();
      if (!error && prof?.user_data && prof.user_data[reg.shortKey]) {
        const candidate = prof.user_data[reg.shortKey];
        if (!_isEmpty(candidate)) {
          cloudVal = candidate;
        }
      }
    }

    if (!_isEmpty(cloudVal)) {
      console.log('[sync] Recovered', domainKey, 'from cloud:', Array.isArray(cloudVal) ? cloudVal.length + ' items' : 'object');
      _writeLS(reg.lsKey, cloudVal);
      _hydrateGlobal(reg, cloudVal);
      return cloudVal;
    }

    // Nothing in cloud either
    _hydrateGlobal(reg, reg.default);
    return reg.default;

  } catch (e) {
    console.warn('[sync] Cloud fetch failed for', domainKey, ':', e.message);
    _hydrateGlobal(reg, reg.default);
    return reg.default;
  }
}

/**
 * CORE: Save a domain's data — writes to localStorage and queues Supabase sync
 * This should be called instead of direct localStorage writes.
 */
function syncSave(domainKey, value) {
  const reg = SYNC_REGISTRY[domainKey];
  if (!reg) { console.warn('[sync] Unknown domain:', domainKey); return; }

  // Write to localStorage immediately
  _writeLS(reg.lsKey, value);

  // Update the global
  _hydrateGlobal(reg, value);

  // Queue Supabase write (debounced)
  _syncDirty.add(domainKey);
  clearTimeout(_syncFlushTimer);
  _syncFlushTimer = setTimeout(_syncFlush, 2000);
}

/**
 * Flush all dirty domains to Supabase
 */
async function _syncFlush() {
  if (!currentUser || _syncDirty.size === 0) return;
  const domains = [..._syncDirty];
  _syncDirty.clear();

  // Build profiles.user_data patch
  const patch = {};
  for (const dk of domains) {
    const reg = SYNC_REGISTRY[dk];
    if (!reg) continue;
    const val = _readLS(reg.lsKey, reg.default);
    patch[reg.shortKey] = val;

    // Also write to dedicated tables if applicable
    if (reg.cloudSource === 'user_filters' && Array.isArray(val)) {
      _syncFiltersToTable(val);
    } else if (reg.cloudSource === 'user_tuning' && typeof val === 'object') {
      _syncTuningToTable(val);
    }
  }

  // Merge into profiles.user_data
  try {
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    const cached = _readLS('_bj_ud_cache', {});
    Object.assign(cached, patch);
    await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_data: cached })
    });
    _writeLS('_bj_ud_cache', cached);
    console.log('[sync] Flushed:', domains.join(', '));
  } catch (e) {
    console.warn('[sync] Flush error:', e.message);
    // Re-queue failed domains
    domains.forEach(d => _syncDirty.add(d));
  }
}

/** Sync saved filters to dedicated user_filters table */
async function _syncFiltersToTable(filters) {
  try {
    // Upsert each filter
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      if (f._id) {
        // Existing — update
        await sb.from('user_filters').update({
          name: f.name || 'Untitled',
          filter_data: f,
          sort_order: i,
        }).eq('id', f._id);
      }
      // New filters without _id will be handled by the existing save flow
    }
  } catch (e) {
    console.warn('[sync] Filters table sync error:', e.message);
  }
}

/** Sync tuning to dedicated user_tuning table */
async function _syncTuningToTable(tuning) {
  try {
    await sb.from('user_tuning').upsert({
      user_id: currentUser.id,
      tuning_data: tuning,
    });
  } catch (e) {
    console.warn('[sync] Tuning table sync error:', e.message);
  }
}

/**
 * HEALTH CHECK: Verify all domains have data in localStorage.
 * If any are missing, trigger cloud recovery.
 * Call this on page load after auth is ready.
 */
async function syncHealthCheck() {
  if (typeof sb === 'undefined' || !currentUser) return;
  console.log('[sync] Running health check...');
  const missing = [];
  for (const [dk, reg] of Object.entries(SYNC_REGISTRY)) {
    const val = _readLS(reg.lsKey, null);
    if (_isEmpty(val)) {
      missing.push(dk);
    }
  }
  if (missing.length === 0) {
    console.log('[sync] Health check passed — all domains have local data');
    return;
  }
  console.log('[sync] Missing domains:', missing.join(', '), '— recovering from cloud');
  for (const dk of missing) {
    await syncEnsure(dk);
  }
  // Trigger re-renders for recovered domains
  if (missing.includes('saved_filters') && typeof renderSavedFilters === 'function') {
    renderSavedFilters();
  }
  if (missing.includes('resumes') && typeof renderResumes === 'function') {
    renderResumes();
  }
  if (missing.includes('tuning')) {
    // Re-hydrate tuning sub-globals
    if (typeof tuningSettings !== 'undefined') {
      tuningTitleExclPills = tuningSettings.titleExcludes || [];
      tuningCoExclPills = tuningSettings.companyExcludes || [];
      tuningIndExclPills = tuningSettings.industryExcludes || [];
      levelHierarchy = tuningSettings.levelHierarchy || [];
    }
  }
  console.log('[sync] Health check recovery complete');
}

// Expose globally
window.syncEnsure = syncEnsure;
window.syncSave = syncSave;
window.syncHealthCheck = syncHealthCheck;
window.SYNC_REGISTRY = SYNC_REGISTRY;
