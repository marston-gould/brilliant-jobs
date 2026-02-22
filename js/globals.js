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
  // Size guard: warn if single key exceeds 500KB, reject if >2MB (v3.85)
  var bytes = new Blob([jsonStr]).size;
  if (bytes > 2 * 1024 * 1024) {
    console.error('[BJ] Storage rejected: ' + lsKey + ' is ' + Math.round(bytes / 1024) + 'KB (>2MB limit)');
    return false;
  }
  if (bytes > 500 * 1024) {
    console.warn('[BJ] Storage warning: ' + lsKey + ' is ' + Math.round(bytes / 1024) + 'KB');
  }
  try {
    localStorage.setItem(lsKey, jsonStr);
  } catch (e) {
    // QuotaExceededError — storage is full
    console.error('[BJ] Storage full! Failed to save ' + lsKey + ':', e.message);
    _handleStorageFull(lsKey);
    return false;
  }
  const shortKey = UD_LS_TO_SHORT[lsKey];
  if (shortKey && currentUser) {
    _udPendingKeys.add(shortKey);
    clearTimeout(_udSyncTimer);
    _udSyncTimer = setTimeout(_flushUserData, 2000);
  }
  return true;
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



// ============================================================
// STORAGE HEALTH — size monitoring and emergency cleanup (v3.85)
// ============================================================

/** Get total localStorage usage in bytes */
function getStorageUsage() {
  var total = 0;
  var keys = {};
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var size = new Blob([localStorage.getItem(key)]).size;
    total += size + new Blob([key]).size;
    if (key.startsWith('bj_')) keys[key] = size;
  }
  return { totalBytes: total, totalKB: Math.round(total / 1024), bjKeys: keys };
}

/** Log storage usage to console (call from DevTools: storageHealth()) */
function storageHealth() {
  var usage = getStorageUsage();
  console.group('[BJ] Storage Health');
  console.log('Total localStorage:', usage.totalKB + 'KB');
  var sorted = Object.entries(usage.bjKeys).sort(function(a, b) { return b[1] - a[1]; });
  sorted.forEach(function(entry) {
    var pct = Math.round(entry[1] / usage.totalBytes * 100);
    console.log('  ' + entry[0] + ': ' + Math.round(entry[1] / 1024) + 'KB (' + pct + '%)');
  });
  console.log('Estimated limit: ~5MB (varies by browser)');
  console.log('Usage: ' + Math.round(usage.totalBytes / (5 * 1024 * 1024) * 100) + '% of estimated limit');
  console.groupEnd();
  return usage;
}

/** Emergency cleanup when storage is full */
function _handleStorageFull(failedKey) {
  console.warn('[BJ] Running emergency storage cleanup...');
  // Priority: remove caches first, then old data
  var sacrificial = ['bj_readiness', 'bj_ref_city_radius', '_bj_ud_cache'];
  for (var i = 0; i < sacrificial.length; i++) {
    if (sacrificial[i] !== failedKey) {
      localStorage.removeItem(sacrificial[i]);
      console.log('[BJ] Cleared ' + sacrificial[i]);
    }
  }
  // Trim hidden_jobs and applied_jobs to last 500
  ['bj_hidden_jobs', 'bj_applied_jobs', 'bj_saved_jobs'].forEach(function(key) {
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      if (arr.length > 500) {
        arr = arr.slice(-500);
        localStorage.setItem(key, JSON.stringify(arr));
        console.log('[BJ] Trimmed ' + key + ' to 500 items');
      }
    } catch (e) {}
  });
  // Trim app_history to last 200
  try {
    var hist = JSON.parse(localStorage.getItem('bj_app_history') || '[]');
    if (hist.length > 200) {
      hist = hist.slice(-200);
      localStorage.setItem('bj_app_history', JSON.stringify(hist));
      console.log('[BJ] Trimmed bj_app_history to 200 items');
    }
  } catch (e) {}
}

// ============================================================
// CACHED QUERY — in-memory cache with TTL (v3.84)
// ============================================================
// Usage: const data = await cachedQuery('companies', () => sb.from('ats_companies').select('slug, name, job_count, source'), { ttl: 300000 });

var _queryCache = {};

/**
 * Execute a Supabase query with in-memory caching.
 * @param {string} key - Unique cache key
 * @param {function} queryFn - Function that returns a Supabase query promise
 * @param {object} opts - { ttl: ms (default 5 min), force: boolean }
 * @returns {Promise<any>} Cached or fresh data
 */
async function cachedQuery(key, queryFn, opts) {
  var ttl = (opts && opts.ttl) || 300000; // 5 min default
  var force = opts && opts.force;
  var entry = _queryCache[key];

  if (!force && entry && Date.now() - entry.ts < ttl) {
    return entry.data;
  }

  try {
    var result = await queryFn();
    if (result.error) {
      console.warn('[cachedQuery] Error for', key, result.error.message);
      // Return stale cache if available
      return entry ? entry.data : null;
    }
    _queryCache[key] = { data: result.data, ts: Date.now(), count: result.count };
    return result.data;
  } catch (e) {
    console.warn('[cachedQuery] Failed for', key, e.message);
    return entry ? entry.data : null;
  }
}

/** Get cached count (if query used { count: 'exact' }) */
function cachedCount(key) {
  var entry = _queryCache[key];
  return entry ? entry.count : null;
}

/** Invalidate a specific cache key or all keys matching a prefix */
function invalidateCache(keyOrPrefix) {
  if (!keyOrPrefix) { _queryCache = {}; return; }
  Object.keys(_queryCache).forEach(function(k) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ':')) delete _queryCache[k];
  });
}

/** Pre-warm static ref table caches on app init */
async function prewarmRefCaches() {
  try {
    await Promise.all([
      cachedQuery('ref:industries', function() {
        return sb.from('ref_industries').select('name, category').order('name');
      }, { ttl: 3600000 }), // 1 hour TTL — rarely changes
      cachedQuery('ref:companies:list', function() {
        return sb.from('ats_companies').select('slug, name, job_count, source').order('name');
      }, { ttl: 600000 }), // 10 min TTL — job_count updates periodically
    ]);
    console.log('[BJ] Ref caches pre-warmed');
  } catch (e) {
    console.warn('[BJ] Ref cache pre-warm failed:', e.message);
  }
}
