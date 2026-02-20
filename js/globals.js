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
