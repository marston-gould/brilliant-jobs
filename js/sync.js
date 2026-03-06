// ============================================================
// SYNC HEALTH CHECK — Safety net for localStorage ↔ Supabase consistency
// v5.00 — Works alongside globals.js saveUserData/loadUserData
// ============================================================
//
// globals.js has the primary sync system:
//   saveUserData(lsKey, jsonStr) → localStorage + debounced Supabase PATCH
//   loadUserData(userId) → Supabase → localStorage on login
//
// This file provides:
//   syncHealthCheck() — runs after auth, detects empty localStorage keys
//     and recovers them from Supabase (covers browser clear, incognito, new device)
//   syncHydrate() — deep recovery from dedicated tables (user_filters, user_tuning)
//
// ALL writes MUST go through saveUserData() in globals.js.
// Modules should NEVER call localStorage.setItem for synced keys directly.

/**
 * Health check: verify all synced domains have data in localStorage.
 * If any are missing, trigger cloud recovery and re-render affected UI.
 * Call this on page load after auth is ready.
 */
async function syncHealthCheck() {
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
  console.log('[sync] Running health check...');

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

  const GLOBALS_MAP = {
    saved_filters: 'savedFilters',
    resumes: 'resumes',
    tuning: 'tuningSettings',
    hidden_jobs: 'hiddenJobIds',
    saved_jobs: 'savedJobIds',
    applied_jobs: 'appliedJobIds',
    applied_dates: 'appliedDates',
    readiness: 'readinessCache',
    app_queue: 'appQueue',
    app_history: 'appHistory',
  };

  const missing = [];
  for (const [shortKey, lsKey] of Object.entries(UD_KEYS)) {
    try {
      const raw = localStorage.getItem(lsKey);
      const parsed = raw ? JSON.parse(raw) : null;
      const empty = parsed == null ||
        (Array.isArray(parsed) && parsed.length === 0) ||
        (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0);
      if (empty) missing.push(shortKey);
    } catch { missing.push(shortKey); }
  }

  if (missing.length === 0) {
    console.log('[sync] Health check passed — all data present');
    return;
  }

  console.log('[sync] Missing:', missing.join(', '), '— recovering from cloud');

  // Fetch profiles.user_data
  try {
    const { data, error } = await sb.from('profiles')
      .select('user_data')
      .eq('id', currentUser.id)
      .single();

    if (!error && data?.user_data) {
      const cloud = data.user_data;
      localStorage.setItem('_bj_ud_cache', JSON.stringify(cloud));

      for (const shortKey of missing) {
        const lsKey = UD_KEYS[shortKey];
        const cloudVal = cloud[shortKey];
        if (cloudVal != null) {
          const isNotEmpty = Array.isArray(cloudVal) ? cloudVal.length > 0 :
            typeof cloudVal === 'object' ? Object.keys(cloudVal).length > 0 : true;
          if (isNotEmpty) {
            localStorage.setItem(lsKey, JSON.stringify(cloudVal));
            // Also update the global variable
            const globalName = GLOBALS_MAP[shortKey];
            if (globalName && typeof window[globalName] !== 'undefined') {
              window[globalName] = cloudVal;
            }
            console.log('[sync] Recovered', shortKey, 'from cloud');
          }
        }
      }
    }
  } catch(e) { reportError('sync', e); console.warn('[sync] Health check cloud fetch error:', e.message);
  }

  // Try dedicated tables for filters and tuning
  if (missing.includes('saved_filters')) {
    try {
      const { data: filters } = await sb.from('user_filters')
        .select('*').eq('user_id', currentUser.id).order('sort_order');
      if (filters && filters.length > 0) {
        const recovered = filters.map(f => ({ ...f.filter_data, _id: f.id, name: f.name }));
        savedFilters = recovered;
        localStorage.setItem('bj_saved_filters', JSON.stringify(recovered));
        console.log('[sync] Recovered', filters.length, 'filters from user_filters table');
      }
    } catch(e) { reportError('sync:table may not exist', e); }
  }

  if (missing.includes('tuning')) {
    try {
      const { data: tuning } = await sb.from('user_tuning')
        .select('tuning_data').eq('user_id', currentUser.id).single();
      if (tuning?.tuning_data && Object.keys(tuning.tuning_data).length > 0) {
        tuningSettings = tuning.tuning_data;
        localStorage.setItem('bj_tuning', JSON.stringify(tuning.tuning_data));
        // Re-hydrate tuning sub-globals
        tuningLocExclPills = tuningSettings.locationExcludes || [];
        tuningTitleExclPills = tuningSettings.titleExcludes || [];
        tuningCoExclPills = tuningSettings.companyExcludes || [];
        tuningIndExclPills = tuningSettings.industryExcludes || [];
        levelHierarchy = tuningSettings.levelHierarchy || [];
        console.log('[sync] Recovered tuning from user_tuning table');
      }
    } catch(e) { reportError('sync:table may not exist', e); }
  }

  // Trigger re-renders for recovered UI data
  if (missing.includes('saved_filters') && typeof renderSavedFilters === 'function') {
    try { renderSavedFilters(); } catch(e) { reportError('sync:sync', e); }
  }
  if (missing.includes('resumes') && typeof renderResumes === 'function') {
    try { renderResumes(); } catch(e) { reportError('sync:sync', e); }
  }

  console.log('[sync] Health check recovery complete');
}

// Expose globally
window.syncHealthCheck = syncHealthCheck;
