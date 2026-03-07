// ============================================================
// SYNC HEALTH CHECK — Safety net for localStorage ↔ Supabase consistency
// CS-P1-015: TypeScript strict mode
// ============================================================

async function syncHealthCheck(): Promise<void> {
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
  console.log('[sync] Running health check...');

  var UD_KEYS: Record<string, string> = {
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

  var GLOBALS_MAP: Record<string, string> = {
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

  var missing: string[] = [];
  for (var _shortKey of Object.keys(UD_KEYS)) {
    var lsKey = UD_KEYS[_shortKey]!;
    try {
      var raw = localStorage.getItem(lsKey);
      var parsed: unknown = raw ? JSON.parse(raw) : null;
      var empty = parsed == null ||
        (Array.isArray(parsed) && parsed.length === 0) ||
        (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as Record<string, unknown>).length === 0);
      if (empty) missing.push(_shortKey);
    } catch { missing.push(_shortKey); }
  }

  if (missing.length === 0) {
    console.log('[sync] Health check passed — all data present');
    return;
  }

  console.log('[sync] Missing:', missing.join(', '), '— recovering from cloud');

  try {
    var result = await (sb as SupabaseClient).from('profiles')
      .select('user_data')
      .eq('id', currentUser.id)
      .single();

    var data = result.data as Record<string, unknown> | null;
    var error = result.error;

    if (!error && data?.user_data) {
      var cloud = data.user_data as Record<string, unknown>;
      localStorage.setItem('_bj_ud_cache', JSON.stringify(cloud));

      for (var shortKey of missing) {
        var lsKeyRecover = UD_KEYS[shortKey]!;
        var cloudVal = cloud[shortKey] as unknown;
        if (cloudVal != null) {
          var isNotEmpty = Array.isArray(cloudVal) ? cloudVal.length > 0 :
            typeof cloudVal === 'object' ? Object.keys(cloudVal as Record<string, unknown>).length > 0 : true;
          if (isNotEmpty) {
            localStorage.setItem(lsKeyRecover, JSON.stringify(cloudVal));
            var globalName = GLOBALS_MAP[shortKey];
            if (globalName && typeof (window as Record<string, unknown>)[globalName] !== 'undefined') {
              (window as Record<string, unknown>)[globalName] = cloudVal;
            }
            console.log('[sync] Recovered', shortKey, 'from cloud');
          }
        }
      }
    }
  } catch (e: unknown) {
    reportError('sync', e);
    console.warn('[sync] Health check cloud fetch error:', (e as Error).message);
  }

  if (missing.includes('saved_filters')) {
    try {
      var filterResult = await (sb as SupabaseClient).from('user_filters')
        .select('*').eq('user_id', currentUser.id).order('sort_order');
      var filters = filterResult.data as Array<Record<string, unknown>> | null;
      if (filters && filters.length > 0) {
        var recovered = filters.map(function(f: Record<string, unknown>) {
          return { ...(f.filter_data as Record<string, unknown>), _id: f.id, name: f.name };
        });
        (window as Record<string, unknown>).savedFilters = recovered;
        localStorage.setItem('bj_saved_filters', JSON.stringify(recovered));
        console.log('[sync] Recovered', filters.length, 'filters from user_filters table');
      }
    } catch (e: unknown) { reportError('sync:table may not exist', e); }
  }

  if (missing.includes('tuning')) {
    try {
      var tuningResult = await (sb as SupabaseClient).from('user_tuning')
        .select('tuning_data').eq('user_id', currentUser.id).single();
      var tuningData = tuningResult.data as Record<string, unknown> | null;
      if (tuningData?.tuning_data && Object.keys(tuningData.tuning_data as Record<string, unknown>).length > 0) {
        var td = tuningData.tuning_data as TuningSettings;
        tuningSettings = td;
        localStorage.setItem('bj_tuning', JSON.stringify(td));
        tuningLocExclPills = td.locationExcludes || [];
        tuningTitleExclPills = td.titleExcludes || [];
        tuningCoExclPills = td.companyExcludes || [];
        tuningIndExclPills = td.industryExcludes || [];
        levelHierarchy = td.levelHierarchy || [];
        console.log('[sync] Recovered tuning from user_tuning table');
      }
    } catch (e: unknown) { reportError('sync:table may not exist', e); }
  }

  if (missing.includes('saved_filters') && typeof renderSavedFilters === 'function') {
    try { renderSavedFilters(); } catch (e: unknown) { reportError('sync:sync', e); }
  }
  if (missing.includes('resumes') && typeof renderResumes === 'function') {
    try { renderResumes(); } catch (e: unknown) { reportError('sync:sync', e); }
  }

  console.log('[sync] Health check recovery complete');
}

window.syncHealthCheck = syncHealthCheck;

// CS-P1-004 FE-005: Register sync exports with BJ namespace
(function(): void {
  (['syncHealthCheck'] as const).forEach(function(name) {
    var fn = (window as Record<string, unknown>)[name];
    if (typeof fn === 'function') {
      (window.BJ as Record<string, unknown>)[name] = fn;
      window.BJ._registry[name] = { module: 'sync', registered: Date.now() };
    }
  });
})();
