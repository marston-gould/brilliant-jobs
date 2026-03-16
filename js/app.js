// [BJ] Dashboard v7.22 loaded
console.log('[BJ] Dashboard ' + BJ_VERSION + ' loaded');
// BJ_VERSION is defined in js/version.js (single source of truth)
// version.js auto-populates #nav-version and .bj-version elements

// CS-P1-007 DS1-6: Page metadata for virtual $pageview events (all 14 pages)
var _bjPageTitles = {
  brilliant: 'Get Started', setup: 'Setup', jobs: 'Jobs Feed', tuning: 'Search Tuning',
  resumes: 'Resumes', 'resume-builder': 'Resume Builder', applications: 'My Applications', notifications: 'Notifications',
  stats: 'Stats', 'interview-prep': 'Interview Prep', settings: 'Settings',
  subscription: 'Subscription', feedback: 'Feedback',
  'admin-landing': 'Landing Page'
};
var _bjPageSections = {
  brilliant: 'onboarding', setup: 'onboarding', jobs: 'search', tuning: 'search',
  resumes: 'search', 'resume-builder': 'search', applications: 'tracking', notifications: 'tracking',
  stats: 'intelligence', 'interview-prep': 'intelligence',
  settings: 'account', subscription: 'account', feedback: 'account',
  'admin-landing': 'intelligence'
};

// Auth
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }
  currentUser = session.user;
  // CS-003 + CS-P1-007 DS1-4: PostHog identity resolution — identify user post-login
  if (window.posthog && currentUser) {
    posthog.identify(currentUser.id, {
      email: currentUser.email,
      created_at: currentUser.created_at,
    });
    // DS1-4: $set_once for immutable first-seen props (won't overwrite on subsequent logins)
    posthog.setPersonProperties({}, {
      first_seen_at: currentUser.created_at,
      signup_source: 'dashboard',
    });
    // DS1-4: Surface super property — all dashboard events tagged
    posthog.register({ bj_surface: 'dashboard' });
  }
  // Persist account flag for landing page segment detection (survives logout)
  localStorage.setItem('bj_has_account', 'true');

// Pre-warm static ref table caches (v3.84)
if (typeof prewarmRefCaches === 'function') prewarmRefCaches();

// Error recovery & offline resilience (v3.87)
if (typeof initOfflineDetection === 'function') initOfflineDetection();
if (typeof initGlobalErrorHandlers === 'function') initGlobalErrorHandlers();

// Session management hardening (v3.90)
if (typeof initSessionManagement === 'function') initSessionManagement();
  let profile = null;
  try {
    const p = await safeQuery(() => sb.from('profiles').select('approved,cohort_id,plan,role').eq('id', currentUser.id).single(), { label: 'app:profiles', fallback: null });
    profile = p;
    if (!p?.approved) { window.location.href = '/?pending=1'; return; }
    currentUser._cohortId = p.cohort_id || null;
    window._bjUserPlan = p.plan || 'free';
    window._bjUserRole = p.role || 'user';
  } catch (e) { if (typeof toastError === 'function') toastError('Failed to load your profile. Please refresh the page.'); }
  $('#auth-gate').style.display = 'none';
  $('#app').style.display = 'flex';
  // Referral attribution — check if new user came via referral link (Phase 4 v5.10)
  try { await processReferralAttribution(currentUser); } catch(e) { reportError('app', e); console.warn('[Referral] Attribution check skipped:', e.message); }
  // Show admin nav immediately — profile already fetched, no extra round trip
  window._isAdmin = !!(profile && profile.role === 'admin');
  if (window._isAdmin) {
    var navAdmin = document.getElementById('nav-admin');
    if (navAdmin) { navAdmin.style.display = ''; console.log('[Admin] \u2713 Nav shown'); }
    // Show survey analytics tab (admin-only) in Feedback page
    var surveyTab = document.getElementById('fb-tab-surveys');
    if (surveyTab) surveyTab.style.display = '';
    // Show landing page admin nav (LP-RESTRUCTURE-S3)
    var navAdminLanding = document.getElementById('nav-admin-landing');
    if (navAdminLanding) navAdminLanding.style.display = '';
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
  // Update nav tier badge based on profile role/plan
  const navPlanEl = document.querySelector('.nav-user-plan');
  if (navPlanEl && profile) {
    if (profile.role === 'admin') {
      navPlanEl.textContent = 'ADMIN';
      navPlanEl.style.color = 'var(--warm)';
      navPlanEl.style.fontWeight = '700';
      navPlanEl.style.letterSpacing = '1px';
    } else if ((profile.plan || 'free') === 'pro') {
      navPlanEl.textContent = 'Pro Plan';
      navPlanEl.style.color = 'var(--accent)';
      navPlanEl.style.fontWeight = '600';
    } else if ((profile.plan || 'free') === 'enterprise') {
      navPlanEl.textContent = 'Enterprise';
      navPlanEl.style.color = 'var(--purple)';
      navPlanEl.style.fontWeight = '600';
    } else {
      navPlanEl.textContent = 'Free Plan';
    }
  }
  // Sync user data from Supabase → localStorage on login
  await loadUserData(currentUser.id);
  // Session analytics — Phase B
  const bjSessionId = await initSession();
  if (bjSessionId && window.posthog) {
    posthog.register({
      bj_session_id: bjSessionId,
      bj_cohort_id: currentUser._cohortId || null,
      bj_plan_id: window._bjUserPlan || 'free',
      bj_surface: 'dashboard'
    });
  }
  // CS-P1-007 DS1-6: Initial virtual $pageview on dashboard load
  if (window.posthog) {
    var _initPage = localStorage.getItem('bj_active_tab') || 'brilliant';
    var _initTitle = _bjPageTitles[_initPage] || _initPage;
    posthog.capture('$pageview', {
      $current_url: window.location.origin + '/dashboard.html#' + _initPage,
      $pathname: '/dashboard.html#' + _initPage,
      title: 'Brilliant Jobs — ' + _initTitle,
      bj_page: _initPage,
      bj_page_section: _bjPageSections[_initPage] || 'other',
      bj_initial_load: true,
    });
  }
  // Re-init admin page if it was the active tab (tab restore runs before auth)
  // Admin moved to /admin page (v6.26)
  
  // Q24-Q25: Load saved filters and tuning from Supabase (fallback to localStorage)
  const userId = session?.user?.id;
  
  // Load filters from Supabase
  let filtersFromCloud = false;
  if (userId) {
    const cloudFilters = await safeQuery(() => sb.from('user_filters').select('*').eq('user_id', userId).order('sort_order'), { label: 'app:user_filters', fallback: [] });
    if (cloudFilters && cloudFilters.length > 0) {
      savedFilters = cloudFilters.map(f => ({ ...f.filter_data, _id: f.id, name: f.name }));
      filtersFromCloud = true;
    }
  }
  if (!filtersFromCloud) {
    savedFilters = safeReadLS('bj_saved_filters', []);
    // Migrate localStorage filters to Supabase on first load
    if (userId && savedFilters.length > 0 && !localStorage.getItem('bj_filters_migrated')) {
      for (let i = 0; i < savedFilters.length; i++) {
        const f = savedFilters[i];
        var { error: fltErr } = await sb.from('user_filters').insert({
          user_id: userId,
          name: f.name || 'Untitled',
          filter_data: f,
          sort_order: i,
        });
        if (fltErr) { reportError('app:filter-migrate', fltErr); break; }
      }
      localStorage.setItem('bj_filters_migrated', '1');
      showToast('Your saved searches are now synced to the cloud.', { type: 'success', duration: 5000 });
    }
  }

  // v7.21: Re-apply progressive nav now that savedFilters is loaded from DB
  // initOnboarding() runs synchronously at parse time before this async fetch completes,
  // so nav items were always dimmed for users with saved filters.
  {
    let _step = getOnboardingStep();
    if (_step < 1 && resumes && resumes.length > 0) { updateOnboardingStep(1); _step = 1; }
    if (_step < 2 && savedFilters && savedFilters.length > 0) { updateOnboardingStep(2); _step = 2; }
    if (_step < 3 && localStorage.getItem('bj_first_search_done')) { updateOnboardingStep(3); _step = 3; }
    if (_step < 4 && localStorage.getItem('bj_pipeline_used')) { updateOnboardingStep(4); _step = 4; }
    applyProgressiveNav(_step);
  }

  // Block 7: Check for pending pills from city page conversion
  try {
    var pendingPills = safeReadLS('bj_pending_pills', []);
    if (pendingPills.length > 0) {
      localStorage.removeItem('bj_pending_pills');
      // Apply to active filter (or first filter, or create new)
      var target = currentFilter || (savedFilters && savedFilters.length > 0 ? savedFilters[0] : null);
      if (target) {
        var pillsKey = target.pills ? 'pills' : 'keywords';
        if (!target[pillsKey]) target[pillsKey] = [];
        pendingPills.forEach(function(pp) {
          var pillType = pp.type === 'title' ? 'TITLE' : pp.type === 'skill' ? 'SKILLS' : pp.type === 'industry' ? 'INDUSTRY' : 'KEYWORD';
          var exists = target[pillsKey].some(function(p) { return p.type === pillType && p.value === pp.value; });
          if (!exists) {
            target[pillsKey].push({ type: pillType, value: pp.value, _from: 'city_page' });
          }
        });
        localStorage.setItem('bj_saved_filters', JSON.stringify(savedFilters));
        var names = pendingPills.map(function(p) { return '"' + p.value + '"'; }).join(', ');
        showToast('Added ' + names + ' to your search filters', { type: 'success', duration: 5000 });
        if (window.posthog) posthog.capture('pending_pills_applied', { count: pendingPills.length, pills: pendingPills });
      }
    }
  } catch(e) { reportError('app', e); console.warn('[pills] Pending pill apply failed:', e.message); }
  
  // Load tuning from Supabase
  // First: normalize any legacy WHEN pills in saved filters
  let whenNormDirty = false;
  savedFilters.forEach(sf => {
    if (sf.whenPills && sf.whenPills.length > 0) {
      sf.whenPills.forEach(pill => {
        if (pill.values && pill.values.length > 0) {
          const norm = typeof normalizeWhenValue === 'function' ? normalizeWhenValue(pill.values[0]) : null;
          if (norm && norm.label !== pill.values[0]) {
            pill.values[0] = norm.label;
            whenNormDirty = true;
          }
        }
      });
    }
  });
  if (whenNormDirty) {
    if (filtersFromCloud && userId) {
      // Persist normalized values back to cloud
      for (let i = 0; i < savedFilters.length; i++) {
        const sf = savedFilters[i];
        if (sf._id) {
          sb.from('user_filters').update({ filter_data: sf }).eq('id', sf._id).then(() => {});
        }
      }
    }
    saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  }

  let tuningFromCloud = false;
  if (userId) {
    const cloudTuning = await safeQuery(() => sb.from('user_tuning').select('tuning_data').eq('user_id', userId).single(), { label: 'app:user_tuning', fallback: null });
    if (cloudTuning?.tuning_data && Object.keys(cloudTuning.tuning_data).length > 0) {
      tuningSettings = cloudTuning.tuning_data;
      tuningFromCloud = true;
    }
  }
  if (!tuningFromCloud) {
    tuningSettings = safeReadLS('bj_tuning', {});
    // Migrate to Supabase
    if (userId && Object.keys(tuningSettings).length > 0 && !localStorage.getItem('bj_tuning_migrated')) {
      var { error: tunErr } = await sb.from('user_tuning').upsert({
        user_id: userId,
        tuning_data: tuningSettings,
      }, { onConflict: 'user_id' });
      if (tunErr) reportError('app:tuning-migrate', tunErr);
      else localStorage.setItem('bj_tuning_migrated', '1');
    }
  }
  
  tuningLocExclPills = tuningSettings.locationExcludes || [];
  tuningTitleExclPills = tuningSettings.titleExcludes || [];
  tuningCoExclPills = tuningSettings.companyExcludes || [];
  tuningIndExclPills = tuningSettings.industryExcludes || [];
  levelHierarchy = tuningSettings.levelHierarchy || [];
  hiddenJobIds = safeReadLS('bj_hidden_jobs', []);
  // Pipeline now loaded from Supabase (Ghost Build Phase 1)
  // savedJobIds and appliedJobIds are populated by initPipeline()
  savedJobIds = [];
  appliedJobIds = [];
  resumes = (await readPiiData('bj_resumes')) || [];
  // Safety net: if resumes still empty after loadUserData, try direct cloud fetch (v4.33)
  if (resumes.length === 0 && userId) {
    try {
      const prof = await safeQuery(() => sb.from('profiles').select('user_data').eq('id', userId).single(), { label: 'app:profiles', fallback: null });
      const cloudResumes = prof?.user_data?.resumes;
      if (Array.isArray(cloudResumes) && cloudResumes.length > 0) {
        resumes = cloudResumes;
        saveUserData('bj_resumes', JSON.stringify(resumes));
        console.log('[sync] Resume recovery: restored', resumes.length, 'resumes from cloud');
      }
    } catch(e) { reportError('app', e); console.warn('[sync] Resume recovery failed:', e.message); }
  }
  // Backfill extractedText from resume_archive for any resumes missing it (v8.51)
  // await so it completes before any user interaction, then write directly to cloud
  if (resumes.length > 0 && currentUser) {
    var resumesNeedingText = resumes.filter(function(r) {
      return !r.archived && (!r.extractedText || r.extractedText.length < 100);
    });
    if (resumesNeedingText.length > 0) {
      try {
        var archiveResult = await sb.from('resume_archive')
          .select('resume_id, storage_path, extracted_text')
          .eq('user_id', currentUser.id)
          .eq('is_active', true)
          .not('extracted_text', 'is', null);
        if (!archiveResult.error && archiveResult.data && archiveResult.data.length > 0) {
          var backfillDirty = false;
          archiveResult.data.forEach(function(row) {
            if (!row.extracted_text || row.extracted_text.length < 100) return;
            var idx = resumes.findIndex(function(r) {
              return r.archiveId === row.resume_id || (r.storagePath && r.storagePath === row.storage_path);
            });
            if (idx >= 0 && (!resumes[idx].extractedText || resumes[idx].extractedText.length < 100)) {
              resumes[idx].extractedText = row.extracted_text;
              // keywords bundle is deferred — use it if loaded, else leave empty for renderResumes to fill
              if (typeof extractResumeKeywords === 'function') {
                resumes[idx].keywords = extractResumeKeywords(row.extracted_text);
              }
              resumes[idx].textStatus = 'ready';
              if (!resumes[idx].archiveId) resumes[idx].archiveId = row.resume_id;
              backfillDirty = true;
              console.log('[resume-backfill] Patched extractedText for:', resumes[idx].name);
            }
          });
          if (backfillDirty) {
            // Save to localStorage
            saveUserData('bj_resumes', JSON.stringify(resumes));
            // Also directly PATCH profiles.user_data so it persists across sessions
            // (can't rely on the async saveUserData→_flushUserData chain for reliability)
            const _udCache = safeReadLS('_bj_ud_cache', {});
            _udCache.resumes = resumes;
            const _session = await sb.auth.getSession();
            const _token = _session?.data?.session?.access_token || SUPABASE_KEY;
            fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.id, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + _token,
                'apikey': SUPABASE_KEY,
                'Prefer': 'return=minimal'
              },
              body: JSON.stringify({ user_data: _udCache })
            }).then(function() {
              localStorage.setItem('_bj_ud_cache', JSON.stringify(_udCache));
              console.log('[resume-backfill] Persisted to cloud');
            }).catch(function(e) { reportError('app:backfill-persist', e); });
          }
        }
      } catch(backfillErr) { reportError('app:silent', backfillErr); console.warn('[resume-backfill]', backfillErr.message); }
    }
  }
  // Check for resumes missing storagePath and attempt upload from IndexedDB (v4.46)
  if (resumes.length > 0 && currentUser) {
    var needsStorageSync = resumes.filter(function(r) { return !r.storagePath && !r.archived; });
    if (needsStorageSync.length > 0) {
      console.log('[resume-storage] ' + needsStorageSync.length + ' resumes need Storage upload');
      needsStorageSync.forEach(async function(r) {
        try {
          var file = await bjFileStore.get(r.id);
          if (file) {
            var path = currentUser.id + '/' + r.id + '_' + (r.fileName || 'resume').replace(/[^a-zA-Z0-9._-]/g, '_');
            var { error } = await sb.storage.from('resumes').upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || 'application/octet-stream' });
            if (!error) {
              var idx = resumes.findIndex(function(x) { return x.id === r.id; });
              if (idx >= 0) { resumes[idx].storagePath = path; saveResumes(); }
              console.log('[resume-storage] Backfilled', path);
            }
          }
        } catch(e) { reportError('app:silent', e); }
      });
    }
  }
  // Cloud sync is now live via user_filters + user_tuning tables
  // Q23: Populate global rules crosslink banner
  const grBanner = document.getElementById('global-rules-banner');
  if (grBanner) {
    const parts = [];
    if (tuningSettings.locationExcludes?.length) parts.push(tuningSettings.locationExcludes.length + ' excluded locations');
    if (tuningSettings.titleExcludes?.length) parts.push(tuningSettings.titleExcludes.length + ' excluded titles');
    if (tuningSettings.companyExcludes?.length) parts.push(tuningSettings.companyExcludes.length + ' excluded companies');
    if (tuningSettings.levelHierarchy?.length) parts.push(tuningSettings.levelHierarchy.length + ' levels');
    if (parts.length) {
      grBanner.style.display = 'flex';
    }
  }
  // Initialize Supabase pipeline (migrate localStorage → Supabase on first run)
  if (typeof initPipeline === 'function') await initPipeline();
  // Overlay Pipeline S2: migrate localStorage pipeline → new pipeline table (one-time)
  if (typeof PipelineMigration !== 'undefined' && !PipelineMigration.hasRun()) {
    PipelineMigration.run(window._sb || sb, currentUser.id).catch(function(e) {
      console.warn('[BJ] pipeline-migration failed:', e);
    });
  }
  // Trigger sparkle flourish
  setTimeout(() => { $('#nav-brand').classList.add('sparkle-active'); }, 100);
  // Initialize billing (credit balance, pricing, payment return check)
  if (typeof initBilling === 'function') initBilling();
  // Run unified sync health check — recovers any missing localStorage domains from cloud
  if (typeof syncHealthCheck === 'function') {
    setTimeout(function() { syncHealthCheck(); }, 500);
  }
  if (typeof loadStats === 'function') loadStats();
  checkExtensionStatus();
  if (typeof loadCollections === 'function') loadCollections();
  // Initialize Notification Center (Session 2 — loads state, prefs, opt-in check)
  if (typeof initNotificationCenter === 'function') initNotificationCenter();
  // Start session heartbeat
  if (bjSessionId) {
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        sb.rpc('session_heartbeat', { p_session_id: bjSessionId }).then(r => { if (r.error) reportError('app:heartbeat', r.error); });
      }
    }, 5 * 60 * 1000);
  }
  // FB-TRIAL-001-S3: Initialize trial gate (banner, sample badges)
  if (typeof initTrialGate === 'function') initTrialGate();
  // EDE-001: Load enrichment request statuses for filter badge display
  loadEnrichmentStatus();
  // POD3-LUCIDE: Initialize Lucide icons after all DOM content is ready
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

// POD3-LUCIDE: Global helper to re-init Lucide icons after dynamic content injection
// Call after renderJobCards(), appendMessage(), renderNotificationItems(), etc.
window.refreshIcons = function() {
  if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
};

// Session analytics — create or reuse session
async function initSession() {
  const existing = sessionStorage.getItem('bj_session_id');
  if (existing) {
    sb.rpc('session_heartbeat', { p_session_id: existing }).then(r => { if (r.error) reportError('app:heartbeat-resume', r.error); });
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
    reportError('app', e);
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
    // CS-P1-007 DS1-6: Virtual $pageview for all 14 dashboard pages (SPA)
    if (window.posthog) {
      var _pgTitle = _bjPageTitles[item.dataset.page] || item.dataset.page;
      posthog.capture('$pageview', {
        $current_url: window.location.origin + '/dashboard.html#' + item.dataset.page,
        $pathname: '/dashboard.html#' + item.dataset.page,
        title: 'Brilliant Jobs — ' + _pgTitle,
        bj_page: item.dataset.page,
        bj_page_section: _bjPageSections[item.dataset.page] || 'other',
      });
    }
    // CS-015: FIX-09 — Error boundaries on tab init + FIX-15 skeleton loaders
    var _tab = item.dataset.page;
    if (window.bjSkeleton) bjSkeleton.show(_tab);
    // CS-016 FIX-10: Lazy-load tab chunks before init
    var _initTab = function() {
      // Init stats charts when stats tab is shown
      if (_tab === 'stats' && typeof initStatsPage === 'function') { if (window.bjTabGuard) bjTabGuard('stats', initStatsPage); else initStatsPage(); }
      // FB-INTPREP-001-S2: Interview Prep page init
      if (_tab === 'interview-prep' && typeof initInterviewPrep === 'function') { if (window.bjTabGuard) bjTabGuard('interview-prep', initInterviewPrep); else initInterviewPrep(); }
      if (_tab === 'brilliant' && typeof initLinkedInImport === 'function') { initLinkedInImport(); }
      // Canny feedback removed v9.44
      // FB-GHOST-BADGE-001: Ghost Monitor page removed — redirect to Applications
      if (_tab === 'ghost') {
        // Redirect any deep links / bookmarks to Applications page
        var appPage = document.getElementById('page-applications');
        var appNav  = document.querySelector('[data-page="applications"]');
        if (appPage) {
          document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
          document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
          appPage.classList.add('active');
          if (appNav) appNav.classList.add('active');
          localStorage.setItem('bj_active_tab', 'applications');
        }
        return;
      }
      // REFERRAL-CONSOL: referrals page removed — redirect to subscription + scroll to referral section
      if (_tab === 'referrals') {
        _tab = 'subscription';
        window.history.replaceState(null, '', '?page=subscription');
        // Fall through to subscription init below, then scroll
        setTimeout(function() { var el = document.getElementById('sub-referral-section'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200);
      }
      // BUG-TAB-001: Subscription tab needs initBilling to populate plan/credits/pricing
      if (_tab === 'subscription' && typeof initBilling === 'function') { if (window.bjTabGuard) bjTabGuard('subscription', initBilling); else initBilling(); }
      // BUG-TAB-001: Settings tab needs applicant profile loaded
      if (_tab === 'settings' && typeof loadApplicantProfile === 'function') { if (window.bjTabGuard) bjTabGuard('settings', loadApplicantProfile); else loadApplicantProfile(); }
      // Refresh resumes when switching to resumes tab
      if (_tab === 'resumes') {
        if (window.bjTabGuard) bjTabGuard('resumes', function() {
          if (typeof renderResumes === 'function') renderResumes();
          var activeCount = (resumes || []).filter(function(r) { return !r.archived; }).length;
          if (activeCount === 0 && typeof reconcileResumeArchive === 'function' && typeof currentUser !== 'undefined' && currentUser) {
            reconcileResumeArchive();
          }
        }); else {
          if (typeof renderResumes === 'function') renderResumes();
          var activeCount = (resumes || []).filter(function(r) { return !r.archived; }).length;
          if (activeCount === 0 && typeof reconcileResumeArchive === 'function' && typeof currentUser !== 'undefined' && currentUser) {
            reconcileResumeArchive();
          }
        }
      }
      // RESUME-BUILDER-001-S1: Resume Builder page init
      if (_tab === 'resume-builder') {
        if (typeof rbInit === 'function') {
          try { rbInit(); } catch(e) { if (typeof reportError === 'function') reportError('app:resume-builder-init', e); }
        }
        if (window.bjSkeleton) setTimeout(function() { bjSkeleton.hide('resume-builder'); }, 150);
      }
      // LP-RESTRUCTURE-S3: Landing Page admin init
      if (_tab === 'admin-landing') {
        if (typeof alInit === 'function') {
          try { alInit(); } catch(e) { if (typeof reportError === 'function') reportError('app:admin-landing-init', e); }
        }
        if (window.bjSkeleton) setTimeout(function() { bjSkeleton.hide('admin-landing'); }, 150);
      }
      // BUGFIX-005: My Applications tab needs pipeline rendered
      if (_tab === 'applications') {
        var savedAppTab = localStorage.getItem('bj_app_tab') || 'pipeline';
        if (typeof switchAppTab === 'function') switchAppTab(savedAppTab);
        if (window.bjSkeleton) setTimeout(function() { bjSkeleton.hide('applications'); }, 150);
      }
      // Tabs without explicit init get skeleton hidden after a short delay (content is static HTML)
      if (!['stats','feedback','resumes','resume-builder','applications','interview-prep','admin-landing'].includes(_tab) && window.bjSkeleton) {
        setTimeout(function() { bjSkeleton.hide(_tab); }, 150);
      }
      // QA-011: Re-search feed when tuning changed (e.g. US-Only toggle)
      if (_tab === 'feed' && window._tuningDirty) {
        window._tuningDirty = false;
        if (typeof searchJobs === 'function') {
          try { searchJobs(0); } catch(e) { if (typeof reportError === 'function') reportError('app:tuning-refresh', e); }
        }
      }
    };
    // Load required chunks then init
    if (typeof bjEnsureTab === 'function') {
      bjEnsureTab(_tab).then(_initTab).catch(function(err) {
        console.error('[BJ] Chunk load failed for tab:', _tab, err);
        if (typeof reportError === 'function') reportError('lazy-loader', err);
        _initTab(); // attempt init anyway — code may already be present
      });
    } else {
      _initTab();
    }
    // Close help panel on page switch
    const hp = $('#page-help-panel'); if (hp) hp.style.display = 'none';
  });
});

// Restore last active tab on load
const lastTab = localStorage.getItem('bj_active_tab');
if (lastTab && $(`#page-${lastTab}`)) {
  // If admin was saved tab, redirect to /admin (v6.26)
  if (lastTab === "admin") { localStorage.setItem("bj_active_tab", "brilliant"); window.location.href = "/admin"; }
  else {
  $$('.page').forEach(p => p.classList.remove('active'));
  $(`#page-${lastTab}`).classList.add('active');
  $$('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === lastTab);
  });
  // CS-015: FIX-09 — Error boundaries on tab restore
  // CS-016 FIX-10: Lazy-load chunks for restored tab
  var _restoreInit = function() {
    if (lastTab === 'stats' && typeof initStatsPage === 'function') { if (window.bjTabGuard) bjTabGuard('stats', initStatsPage); else initStatsPage(); }
    // FB-INTPREP-001-S2: Interview Prep restore
    if (lastTab === 'interview-prep' && typeof initInterviewPrep === 'function') { if (window.bjTabGuard) bjTabGuard('interview-prep', initInterviewPrep); else initInterviewPrep(); }
    if (lastTab === 'brilliant' && typeof initLinkedInImport === 'function') { initLinkedInImport(); }
    // Canny feedback removed v9.44
    // REFERRAL-CONSOL: referrals page removed — redirect to subscription
    if (lastTab === 'referrals') {
      lastTab = 'subscription';
      try { localStorage.setItem('bj_last_tab', 'subscription'); } catch(_e) {}
    }
    // BUG-TAB-001: Restore subscription/settings tab init
    if (lastTab === 'subscription' && typeof initBilling === 'function') { if (window.bjTabGuard) bjTabGuard('subscription', initBilling); else initBilling(); }
    if (lastTab === 'settings' && typeof loadApplicantProfile === 'function') { if (window.bjTabGuard) bjTabGuard('settings', loadApplicantProfile); else loadApplicantProfile(); }
    // FB-GHOST-BADGE-001: ghost tab removed — fall through to applications
    if (lastTab === 'ghost') {
      localStorage.setItem('bj_active_tab', 'applications');
    }
    // APR-001: pipeline is now embedded in applications tab
    if (lastTab === 'pipeline') {
      localStorage.setItem('bj_active_tab', 'applications');
    }
  };
  if (typeof bjEnsureTab === 'function') {
    bjEnsureTab(lastTab).then(_restoreInit).catch(function(err) {
      console.error('[BJ] Chunk load failed for restore tab:', lastTab, err);
      _restoreInit();
    });
  } else {
    _restoreInit();
  }
  }

  // REFERRAL-CONSOL: Generic scrollTo URL param handler — after page render, scroll to target element
  (function() {
    var _scrollParams = new URLSearchParams(window.location.search);
    var _scrollTarget = _scrollParams.get('scrollTo');
    if (_scrollTarget) {
      setTimeout(function() {
        var el = document.getElementById(_scrollTarget);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Clean up URL param
        _scrollParams.delete('scrollTo');
        var _cleanUrl = window.location.pathname + (_scrollParams.toString() ? '?' + _scrollParams.toString() : '');
        window.history.replaceState(null, '', _cleanUrl);
      }, 300);
    }
  })();
}

// Extension detection — check if extension has updated the profile recently
const _helpContent = {
  feed: { title: 'Jobs Feed', steps: [
    'Check one or more saved searches in the sidebar to search jobs.',
    'Shift+click column headers for multi-column sorting.',
    'Click a job title to open the full description and apply.',
    'Colored number badges show which filter matched each job.',
    'Use the keyword insights panel to see term frequency and resume match scores.',
  ]},
  tuning: { title: 'Search Tuning', steps: [
    'Set global rules that apply across ALL your saved searches.',
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
    'Filter by saved search using the dropdown above the stages.',
  ]},
  resumes: { title: 'Resumes', steps: [
    'Upload a resume for each role type or seniority level you target.',
    'Assign a level (Director, Manager, etc.) to each resume.',
    'Click filter pills on each card to assign resumes to your saved searches.',
    'When you apply, the matching resume is automatically selected.',
    'Keyword extraction shows how well each resume matches job descriptions.',
  ]},
  applications: { title: 'Applications', steps: [
    'Queue tab: manage pending applications (manual add, batch process).',
    'Rules tab: set default application mode (Manual, Notify, Auto) and auto-apply rules.',
    'Notifications tab: configure email/SMS preferences for every alert type.',
    'Verify your phone to unlock SMS notifications and escalation.',
    'Set escalation rules: unanswered emails auto-escalate to SMS after your timeout.',
    'Override notification settings per saved search for targeted control.',
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
// Required extension version — bump this when a new extension release ships
// ============================================================
// Shared Connection State — MUST be in shell chunk (app.js) so
// it's available before deferred chunk loads. Previously in
// integrations.js (deferred) which meant Gmail/Extension status
// couldn't update dots during shell init.
// ============================================================
window._connectionState = { ext: false, gmail: false, gcal: false, gdrive: false };

window.renderConnectionStatus = function() {
  var cs = window._connectionState;
  var dots = [
    ['status-ext', 'ext-dot', cs.ext],
    ['status-gmail', 'gmail-dot', cs.gmail],
    ['status-gcal', 'gcal-dot', cs.gcal],
    ['status-gdrive', 'gdrive-dot', cs.gdrive]
  ];
  dots.forEach(function(d) {
    var bar = document.getElementById(d[0]);
    var card = document.getElementById(d[1]);
    if (bar) bar.className = 'setup-status-dot' + (d[2] ? ' connected' : '');
    if (card) card.className = 'setup-dot' + (d[2] ? ' connected' : '');
  });
  var navDot = document.getElementById('ext-status-dot');
  if (navDot) {
    var connCount = (cs.ext ? 1 : 0) + (cs.gmail ? 1 : 0) + (cs.gcal ? 1 : 0) + (cs.gdrive ? 1 : 0);
    navDot.classList.remove('connected', 'warning', 'stale');
    if (connCount === 4) { navDot.classList.add('connected'); navDot.title = 'All integrations connected'; }
    else if (connCount > 0) { navDot.classList.add('warning'); navDot.title = connCount + ' of 4 integrations connected'; }
    else { navDot.title = 'No integrations connected'; }
  }
};

// Pre-load connection state from localStorage (full init in deferred chunk)
(function() {
  try {
    var gd = JSON.parse(localStorage.getItem('bj_gdrive') || '{}');
    if (gd.connected) window._connectionState.gdrive = true;
    var gc = JSON.parse(localStorage.getItem('bj_gcal') || '{}');
    if (gc.connected) window._connectionState.gcal = true;
  } catch(e) { /* gcal localStorage parse — non-critical */ }
})();

var REQUIRED_EXTENSION_VERSION = '2.23.0';

// Reusable confirm modal — replaces all browser confirm() dialogs
window.bjConfirm = function(message, okLabel, cancelLabel) {
  return new Promise(function(resolve) {
    var overlay = document.getElementById('bj-confirm-overlay');
    var msgEl = document.getElementById('bj-confirm-msg');
    var okBtn = document.getElementById('bj-confirm-ok');
    var cancelBtn = document.getElementById('bj-confirm-cancel');
    if (!overlay || !msgEl || !okBtn || !cancelBtn) { resolve(confirm(message)); return; }
    msgEl.innerHTML = message;
    if (okLabel) okBtn.textContent = okLabel;
    if (cancelLabel) cancelBtn.textContent = cancelLabel;
    overlay.style.display = 'flex';
    function cleanup(result) {
      overlay.style.display = 'none';
      okBtn.textContent = 'OK';
      cancelBtn.textContent = 'Cancel';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(e) { if (e.target === overlay) cleanup(false); }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
};

function compareVersions(installed, required) {
  if (!installed || !required) return 0;
  var a = installed.split('.').map(Number);
  var b = required.split('.').map(Number);
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    var av = a[i] || 0, bv = b[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

async function checkExtensionStatus() {
  try {
    // QA-FIX: Guard against auth race — currentUser may be null at startup
    if (!currentUser || !currentUser.id) return;
    const profile = await safeQuery(() => sb.from('profiles').select('last_scan_at, scanner_running, scanner_today_visited, scanner_today_limit, extension_version')
      .eq('id', currentUser.id).single(), { label: 'app:profiles', fallback: null });

    const navDot = $('#ext-status-dot');
    const text = $('#ext-status-text');
    const detail = $('#ext-status-detail');
    const updateBanner = $('#ext-update-banner');
    // POD3-GS: BUG-7 — unified connected/disconnected containers
    const extConnDiv = document.getElementById('ext-setup-connected');
    const extDiscDiv = document.getElementById('ext-setup-disconnected');
    const extInstanceLabel = document.getElementById('ext-instance-label');
    const extDetailConn = document.getElementById('ext-status-detail-connected');

    if (profile?.last_scan_at) {
      const lastScan = new Date(profile.last_scan_at);
      const hoursSince = (Date.now() - lastScan.getTime()) / 3600000;
      // Connected if scanner is running OR scanned within 12h
      const isActive = profile.scanner_running || hoursSince < 12;

      // Nav dot — now driven by renderConnectionStatus aggregate (see integrations.js)
      // No direct manipulation here; just update _connectionState
      var needsUpdate = profile.extension_version && compareVersions(profile.extension_version, REQUIRED_EXTENSION_VERSION) < 0;

      // Connection state = is the extension active. Update status is a separate UI concern.
      window._connectionState.ext = isActive;
      window.renderConnectionStatus();

      // POD3-GS: BUG-7 — Toggle unified connected/disconnected containers
      if (isActive) {
        if (extConnDiv) extConnDiv.style.display = '';
        if (extDiscDiv) extDiscDiv.style.display = 'none';
        // Show the action zone that contains the connected state
        if (extConnDiv && extConnDiv.parentElement) extConnDiv.parentElement.style.display = '';
        if (extInstanceLabel) {
          extInstanceLabel.textContent = profile.extension_version ? 'v' + profile.extension_version : '';
        }
        const timeStr = lastScan.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (extDetailConn) extDetailConn.textContent = profile.scanner_running
          ? 'Active now · last synced at ' + timeStr
          : 'Last active at ' + timeStr;
      } else {
        if (extConnDiv) extConnDiv.style.display = 'none';
        if (extDiscDiv) extDiscDiv.style.display = '';
        // Hide the action zone when disconnected (empty)
        if (extConnDiv && extConnDiv.parentElement) extConnDiv.parentElement.style.display = 'none';
      }

      // Setup page status text (inside disconnected container)
      if (text && detail) {
        if (isActive) {
          text.textContent = needsUpdate ? 'Extension update available' : 'Extension connected';
          const timeStr = lastScan.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
          const todayStr = lastScan.toDateString() === new Date().toDateString() ? 'today' : lastScan.toLocaleDateString([], { month: 'short', day: 'numeric' });
          detail.textContent = profile.scanner_running
            ? `Active now · last synced at ${timeStr}`
            : `Last active ${todayStr} at ${timeStr}`;
          // Hide download button when connected (but not if update needed)
          var dlBox = $('#download-box');
          if (dlBox) dlBox.style.display = needsUpdate ? '' : 'none';
        } else {
          text.textContent = 'Extension inactive';
          detail.textContent = `Last seen ${lastScan.toLocaleDateString([], { month: 'short', day: 'numeric' })} — open Chrome to reconnect`;
        }
      }

      // Update banner
      if (updateBanner) {
        if (needsUpdate && isActive) {
          updateBanner.style.display = '';
          var instVer = $('#ext-installed-ver');
          var reqVer = $('#ext-required-ver');
          var verLabel = $('#ext-update-ver-label');
          if (instVer) instVer.textContent = 'v' + profile.extension_version;
          if (reqVer) reqVer.textContent = 'v' + REQUIRED_EXTENSION_VERSION;
          if (verLabel) verLabel.textContent = REQUIRED_EXTENSION_VERSION;
        } else {
          updateBanner.style.display = 'none';
        }
      }
    }
  } catch(e) { reportError('app:ignore', e); }
}
checkExtensionStatus();
// QA-FIX: Retry quickly in case first call hit null currentUser (auth race)
setTimeout(checkExtensionStatus, 3000);
setInterval(checkExtensionStatus, 60000);

// Saved Jobs card → navigate to My Applications > Board
$('#j-saved-card').addEventListener('click', () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const appNav = $('[data-page="applications"]');
  if (appNav) {
    appNav.classList.add('active');
    appNav.classList.remove('tab-flash');
    void appNav.offsetWidth;
    appNav.classList.add('tab-flash');
    setTimeout(() => appNav.classList.remove('tab-flash'), 1000);
  }
  $$('.page').forEach(p => p.classList.remove('active'));
  $('#page-applications').classList.add('active');
  if (typeof switchAppTab === 'function') switchAppTab('pipeline');
});

// Download — EXT-BUILD-001-S2: Delegate to extension-download.js (in deferred chunk)
// The old handler called /api/build-extension (Vercel route that doesn't exist).
// extension-download.js calls the Supabase build-extension EF directly.
$('#download-btn').addEventListener('click', async () => {
  if (typeof window._bjExtensionDownload !== 'undefined' && window._bjExtensionDownload.downloadBuild) {
    window._bjExtensionDownload.downloadBuild();
  } else {
    // Fallback if deferred chunk hasn't loaded yet — load it then retry
    try {
      await bjLoadChunk('deferred');
      if (window._bjExtensionDownload && window._bjExtensionDownload.downloadBuild) {
        window._bjExtensionDownload.downloadBuild();
      }
    } catch (e) {
      reportError('download_btn', e);
      var status = $('#download-status');
      if (status) status.textContent = 'Error: download module not loaded. Refresh and try again.';
    }
  }
});

// DS1A-13: Guided install step tracking
window.markExtStep = function(step) {
  var el = document.getElementById('ext-step-' + step);
  if (el) {
    el.classList.remove('u-dim-25');
    el.querySelector('.step-num-circle').style.background = 'var(--green)';
    el.querySelector('.step-num-circle').style.color = '#fff';
    var btn = el.querySelector('.btn');
    if (btn) { btn.textContent = '✓ Done'; btn.disabled = true; btn.style.opacity = '0.5'; }
  }
  // Unlock next step
  var next = document.getElementById('ext-step-' + (step + 1));
  if (next) { next.classList.remove('u-dim-25'); next.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  if (window.posthog) posthog.capture('extension_install_step', { step: step, step_name: ['unzip', 'open_extensions', 'load_unpacked', 'pin_and_open'][step - 1] });
  if (step === 4) {
    if (window.posthog) posthog.capture('extension_install_complete');
    var guide = document.getElementById('ext-install-guide');
    if (guide) {
      guide.style.borderLeftColor = 'var(--green)';
      var title = guide.querySelector('.card-title');
      if (title) title.textContent = '✓ Installation Complete';
    }
  }
};

// Update download button — triggers same download flow as main button
var extUpdateDlBtn = $('#ext-update-dl-btn');
if (extUpdateDlBtn) {
  extUpdateDlBtn.addEventListener('click', function() {
    var mainBtn = $('#download-btn');
    if (mainBtn) mainBtn.click();
  });
}

// ============================================================
// GMAIL OAUTH — Connect / Disconnect / Status
// ============================================================

async function initGmailStatus() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const conn = await safeQuery(() => sb.from('gmail_connections').select('gmail_address, sync_status')
      .eq('user_id', session.user.id)
      .maybeSingle(), { label: 'app:gmail_connections', fallback: null });

    const isConnected = conn && conn.sync_status === 'active';
    updateGmailUI(isConnected, conn?.gmail_address || '');
  } catch(e) { reportError('app', e); console.warn('[BJ] Gmail status check failed:', e.message);
  }
}

function updateGmailUI(connected, email) {
  // POD3-GS: BUG-6 — Update shared connection state
  window._connectionState.gmail = connected;
  window.renderConnectionStatus();
  // Setup page
  const setupConn = $('#gmail-setup-connected');
  const setupDisc = $('#gmail-setup-disconnected');
  const setupAddr = $('#gmail-address');
  if (setupConn && setupDisc) {
    setupConn.style.display = connected ? '' : 'none';
    setupDisc.style.display = connected ? 'none' : '';
    if (setupAddr) setupAddr.textContent = email;
  }
  // Ghost monitor page
  const ghostConn = $('#ghost-gmail-connected');
  const ghostBtn = $('#gmail-connect-btn');
  const ghostAddr = $('#ghost-gmail-address');
  const gmailCard = $('#g-gmail-card');
  const gmailChip = document.getElementById('g-gmail-stat');
  if (ghostConn) ghostConn.style.display = connected ? '' : 'none';
  if (ghostBtn) ghostBtn.style.display = connected ? 'none' : '';
  if (ghostAddr) ghostAddr.textContent = email;
  if (gmailCard) {
    const valEl = gmailCard.querySelector('.stat-val');
    if (valEl) { valEl.textContent = connected ? 'Connected' : 'Not Connected'; valEl.style.color = connected ? 'var(--green)' : 'var(--text-faint)'; }
  }
  // Update hero chip
  if (gmailChip) {
    gmailChip.textContent = connected ? 'On' : 'Off';
    gmailChip.className = 'hero-stat-val ' + (connected ? 'hs-green' : 'hs-dim');
    if (!connected) gmailChip.style.fontSize = '12px';
  }
  // Onboarding card (DS1-8)
  const gsGmailStatus = document.getElementById('gs-gmail-status');
  if (gsGmailStatus) {
    gsGmailStatus.innerHTML = connected
      ? '<span style="font-size:11px;color:var(--green);font-weight:600;">✓ Connected</span>'
      : '<button class="btn btn-sm btn-primary" onclick="connectGmail()" style="font-size:11px;padding:4px 12px;">Connect Gmail</button>';
  }
}

window.connectGmail = async function() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please log in first.', { type: 'error' }); return; }
    const res = await fetch('/api/auth/gmail/callback?action=connect', {
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    const json = await res.json();
    if (json.url) {
      window.location.href = json.url;
    } else {
      showToast('Failed to start Gmail connection: ' + (json.error || 'Unknown error'), { type: 'error' });
    }
  } catch (e) {
    showToast('Error connecting Gmail: ' + e.message, { type: 'error' });
  }
};

window.disconnectGmail = async function() {
  if (!await bjConfirm('Disconnect Gmail?<br><span style="font-size:12px;color:var(--text-faint);">Your pipeline will no longer track application responses automatically.</span>', 'Disconnect')) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const res = await fetch('/api/auth/gmail/disconnect', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.access_token }
    });
    const json = await res.json();
    if (json.success) {
      updateGmailUI(false, '');
    } else {
      showToast('Failed to disconnect: ' + (json.error || 'Unknown error'), { type: 'error' });
    }
  } catch (e) {
    showToast('Error disconnecting Gmail: ' + e.message, { type: 'error' });
  }
};

// Handle Gmail callback params
(function handleGmailCallback() {
  const params = new URLSearchParams(window.location.search);
  const gmail = params.get('gmail');
  if (!gmail) return;
  const url = new URL(window.location);
  url.searchParams.delete('gmail');
  window.history.replaceState({}, '', url);
  if (gmail === 'connected') {
    initGmailStatus();
    showToast('Gmail connected! Ghost Monitor will now scan for company responses.', { type: 'success' });
    // v6.04: Mark Gmail integration connected for adoption suppression
    if (typeof markIntegrationConnected === 'function') markIntegrationConnected('gmail');
  } else if (gmail === 'denied') {
    showToast('Gmail connection was cancelled.', { type: 'info' });
  } else if (gmail === 'error') {
    showToast('Gmail connection failed. Please try again.', { type: 'error' });
  }
})();

// Init Gmail status on load
initGmailStatus();

// POD3-GS: BUG-4 + BUG-5 + QA-001 — Fetch live community stats for Get Started data advantage section
// All numbers are live from Supabase — nothing hardcoded. Three distinct metrics:
//   1. "open positions" = ats_jobs WHERE status='open' (consistent with feed logic)
//   2. "career pages tracked" = total ats_companies (all companies being monitored)
//   3. "companies hiring now" = distinct companies with current open jobs (subset of #2)
(async function fetchGetStartedStats() {
  try {
    var posEl = document.getElementById('gs-stat-positions');
    var pagesEl = document.getElementById('gs-stat-pages');
    var companiesEl = document.getElementById('gs-stat-companies');
    var heroEl = document.getElementById('gs-hero-pages');
    if (!posEl && !pagesEl && !companiesEl && !heroEl) return; // Not on Get Started page

    // NOTE: head:true causes 400 on partitioned tables (SA-019 ats_jobs).
    // Use count:'exact' without head, access result.count directly.
    // safeQuery only returns result.data, so we query raw and handle errors inline.

    // 1. Open positions — count of status='open' jobs
    try {
      var jobsResult = await sb.from('ats_jobs').select('*', { count: 'exact', head: false }).eq('status', 'open').limit(0);
      if (!jobsResult.error && jobsResult.count != null && posEl) {
        // QA-BUG: Consistent rounding — all stats round to nearest 1,000
        var rounded = Math.floor(jobsResult.count / 1000) * 1000;
        posEl.textContent = rounded.toLocaleString() + '+';
      }
    } catch(e) { reportError('app:gs-stats-jobs', e); }

    // 2. Career pages tracked — total companies in ats_companies
    try {
      var pagesResult = await sb.from('ats_companies').select('*', { count: 'exact', head: false }).limit(0);
      if (!pagesResult.error && pagesResult.count != null) {
        var rounded = Math.floor(pagesResult.count / 1000) * 1000;
        var displayStr = rounded.toLocaleString() + '+';
        if (pagesEl) pagesEl.textContent = displayStr;
        if (heroEl) heroEl.textContent = displayStr;
      }
    } catch(e) { reportError('app:gs-stats-pages', e); }

    // 3. Companies hiring now — DISTINCT companies from open jobs (subset of career pages)
    try {
      var hiringResult = await sb.rpc('get_distinct_company_count');
      if (!hiringResult.error && hiringResult.data != null && companiesEl) {
        var count = typeof hiringResult.data === 'number' ? hiringResult.data : parseInt(hiringResult.data, 10);
        var rounded = Math.floor(count / 1000) * 1000;
        companiesEl.textContent = rounded.toLocaleString() + '+';
      } else if (companiesEl) {
        // Fallback: simple distinct count via PostgREST (less efficient but works without RPC)
        var fallback = await sb.from('ats_jobs').select('company_name', { count: 'exact', head: false }).eq('status', 'open').limit(0);
        if (!fallback.error && fallback.count != null) {
          // This counts rows not distinct — but it's better than duplicating career pages
          // The RPC approach is the correct one; this is just a safety net
          var rounded = Math.floor(fallback.count / 5000) * 1000; // rough estimate: ~5 jobs per company
          companiesEl.textContent = rounded.toLocaleString() + '+';
        }
      }
    } catch(e) { reportError('app:gs-stats-companies', e); }
  } catch(e) { reportError('app:gs-stats', e); }
})();

// APR-001: Switch between Queue, Pipeline, History sub-tabs in My Applications
window.switchAppTab = function(panel) {
  // FB-APPS-001: Migrate legacy values to new 2-tab model
  if (panel === 'board' || panel === 'queue' || panel === 'history') panel = 'pipeline';
  if (panel !== 'pipeline' && panel !== 'settings' && panel !== 'review-queue') panel = 'pipeline';

  // Toggle top-level tab buttons
  var tabPipeline = document.getElementById('app-top-tab-pipeline');
  var tabSettings = document.getElementById('app-top-tab-settings');
  var tabReviewQueue = document.getElementById('app-top-tab-review-queue');
  if (tabPipeline) tabPipeline.classList.toggle('active', panel === 'pipeline');
  if (tabSettings) tabSettings.classList.toggle('active', panel === 'settings');
  if (tabReviewQueue) tabReviewQueue.classList.toggle('active', panel === 'review-queue');

  // Toggle tab content panels
  var panelPipeline = document.getElementById('app-tab-pipeline');
  var panelSettings = document.getElementById('app-tab-settings');
  var panelReviewQueue = document.getElementById('app-tab-review-queue');
  if (panelPipeline) {
    if (panel === 'pipeline') panelPipeline.classList.remove('u-hidden');
    else panelPipeline.classList.add('u-hidden');
  }
  if (panelSettings) {
    if (panel === 'settings') panelSettings.classList.remove('u-hidden');
    else panelSettings.classList.add('u-hidden');
  }
  if (panelReviewQueue) {
    if (panel === 'review-queue') { panelReviewQueue.classList.remove('u-hidden'); if (typeof loadReviewQueue === 'function') loadReviewQueue(); }
    else panelReviewQueue.classList.add('u-hidden');
  }

  // Show/hide settings summary banner (only visible on Pipeline tab)
  var summaryBanner = document.getElementById('app-settings-summary');
  if (summaryBanner) summaryBanner.style.display = (panel === 'pipeline') ? '' : 'none';

  // Trigger pipeline render when switching to Pipeline tab
  if (panel === 'pipeline') {
    if (typeof renderPipeline === 'function') {
      if (typeof loadPipelineFromSupabase === 'function') {
        loadPipelineFromSupabase().then(function() { renderPipeline(); });
      } else {
        renderPipeline();
      }
    }
    // Update settings summary banner
    if (typeof renderSettingsSummary === 'function') renderSettingsSummary();
  }

  // FB-APPS-001: Score Gate card visibility in Settings tab
  if (panel === 'settings') {
    var scoreGateCard = document.getElementById('score-gate-card');
    if (scoreGateCard) {
      try {
        var as = JSON.parse(localStorage.getItem('bj_apply_settings') || '{}');
        var mode = as.default_apply_mode || 'manual';
        var scoreGateModes = ['score_gated','score_gated_auto','auto_rewrite','autopilot'];
        scoreGateCard.style.display = scoreGateModes.indexOf(mode) !== -1 ? '' : 'none';
      } catch(e) { scoreGateCard.style.display = ''; }
    }
  }

  localStorage.setItem('bj_app_tab', panel);
};

// APR-001: Generic tab switcher — reusable for Applications and Notifications
window.initTabGroup = function(containerSelector) {
  var container = document.querySelector(containerSelector);
  if (!container) return;
  container.querySelectorAll('.app-flow-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var panel = this.dataset.panel;
      var parent = this.closest('.page');
      if (!parent) return;
      parent.querySelectorAll('.app-flow-tab').forEach(function(t) { t.classList.remove('active'); });
      parent.querySelectorAll('.app-flow-panel').forEach(function(p) { p.classList.remove('active'); });
      this.classList.add('active');
      var target = parent.querySelector('#panel-' + panel);
      if (target) target.classList.add('active');
    });
  });
};

// FB-APPS-001: Old APR-001 sub-tab wiring removed — replaced by top-level Pipeline/Settings tabs above

  // FB-APPS-001: Settings Summary Banner — reads current config and populates banner
window.renderSettingsSummary = function() {
  try {
    var as = JSON.parse(localStorage.getItem('bj_apply_settings') || '{}');
    var mode = as.default_apply_mode || 'manual';
    var modeLabels = {
      manual: 'Manual', score_gated: 'Score-Gated',
      auto: 'Auto-Apply', score_gated_auto: 'Auto + Score Gate',
      auto_rewrite: 'Auto + Rewrite', autopilot: 'Full Autopilot'
    };
    var scoreGateModes = ['score_gated','score_gated_auto','auto_rewrite','autopilot'];
    var autoRuleModes = ['auto','score_gated_auto','auto_rewrite','autopilot'];

    // Mode
    var modeEl = document.getElementById('app-summary-mode');
    if (modeEl) modeEl.textContent = 'Mode: ' + (modeLabels[mode] || mode);

    // Score Gate (conditional)
    var gateEl = document.getElementById('app-summary-gate');
    if (gateEl) {
      if (scoreGateModes.indexOf(mode) !== -1) {
        var threshold = document.getElementById('fas-threshold');
        gateEl.style.display = '';
        gateEl.innerHTML = 'Score Gate: ' + (threshold ? threshold.value : (as.default_score_threshold || 70)) + '<span class="app-summary-dot">&middot;</span>';
      } else {
        gateEl.style.display = 'none';
      }
    }

    // Rules count (conditional)
    var rulesEl = document.getElementById('app-summary-rules');
    if (rulesEl) {
      if (autoRuleModes.indexOf(mode) !== -1) {
        var checked = document.querySelectorAll('.rule-toggle:checked').length;
        var total = document.querySelectorAll('.rule-toggle').length;
        rulesEl.style.display = '';
        rulesEl.innerHTML = 'Rules: ' + checked + '/' + total + ' on<span class="app-summary-dot">&middot;</span>';
      } else {
        rulesEl.style.display = 'none';
      }
    }

    // Resume
    var resumeEl = document.getElementById('app-summary-resume');
    if (resumeEl) {
      var sel = document.getElementById('resume-assign-default');
      var resumeName = (sel && sel.selectedIndex > 0) ? sel.options[sel.selectedIndex].text : 'none';
      resumeEl.textContent = 'Resume: ' + resumeName;
      if (resumeName === 'none') resumeEl.style.color = 'var(--warm)';
      else resumeEl.style.color = '';
    }

    // Prompts
    var promptsEl = document.getElementById('app-summary-prompts');
    if (promptsEl) {
      var sp = document.getElementById('pi-smart-prompts');
      promptsEl.textContent = 'Prompts: ' + (sp && sp.checked ? 'On' : 'Off');
    }
  } catch(e) {
    if (typeof reportError === 'function') reportError('renderSettingsSummary', e);
  }
};

// FB-APPS-001: Application Mode label update + Score Gate visibility
(function() {
  var modeLabels = {
    manual: 'Manual', score_gated: 'Score-Gated',
    auto: 'Auto-Apply', score_gated_auto: 'Auto + Score Gate',
    auto_rewrite: 'Auto + Rewrite', autopilot: 'Full Autopilot'
  };
  var scoreGateModes = ['score_gated','score_gated_auto','auto_rewrite','autopilot'];

  function updateModeUI(mode) {
    // Update score gate card visibility in Settings tab
    var sgCard = document.getElementById('score-gate-card');
    if (sgCard) sgCard.style.display = scoreGateModes.indexOf(mode) !== -1 ? '' : 'none';
  }

  document.querySelectorAll('.app-mode-select').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mode = this.dataset.mode;
      document.querySelectorAll('.app-mode-select').forEach(function(b) {
        b.classList.remove('active');
        b.style.border = '';
      });
      this.classList.add('active');
      this.style.border = '2px solid var(--accent)';
      updateModeUI(mode);
    });
  });

  // Initialize mode UI from saved settings
  try {
    var applySettings = JSON.parse(localStorage.getItem('bj_apply_settings') || '{}');
    var currentMode = applySettings.default_apply_mode || 'manual';
    updateModeUI(currentMode);
    // Highlight the correct mode button
    document.querySelectorAll('.app-mode-select').forEach(function(btn) {
      if (btn.dataset.mode === currentMode) {
        btn.classList.add('active');
        btn.style.border = '2px solid var(--accent)';
      } else {
        btn.classList.remove('active');
        btn.style.border = '';
      }
    });
  } catch(e) { /* ignore */ }

  // FB-APPS-001: Wire top-level Pipeline/Settings tabs
  // Default to pipeline on load (migrate legacy values)
  var saved = localStorage.getItem('bj_app_tab') || 'pipeline';
  // Migrate legacy sub-tab values
  if (saved === 'board' || saved === 'queue' || saved === 'history') saved = 'pipeline';
  if (saved !== 'pipeline' && saved !== 'settings') saved = 'pipeline';
  if (typeof switchAppTab === 'function') switchAppTab(saved);

  // Notifications tabs (unchanged)
  if (typeof initTabGroup === 'function') initTabGroup('#page-notifications');

  // FB-APPS-001: Queue section visibility — show when queue count > 0
  window.updateQueueSectionVisibility = function() {
    var queueSection = document.getElementById('app-queue-section');
    var queueBadge = document.getElementById('app-queue-badge');
    var queuedEl = document.getElementById('a-queued');
    if (queueSection && queuedEl) {
      var count = parseInt(queuedEl.textContent) || 0;
      queueSection.style.display = count > 0 ? '' : 'none';
      if (queueBadge) queueBadge.textContent = count > 0 ? ('(' + count + ')') : '';
    }
  };

  // Render settings summary on initial load
  if (typeof renderSettingsSummary === 'function') renderSettingsSummary();
})();

// Q16-Q19: Resume-First Onboarding
let _onboardProfile = null;

window.handleOnboardResume = async function(input) {
  const file = input.files?.[0];
  if (!file) return;
  
  // Read file as text (for PDF, we'd need pdf.js — for now handle text-based)
  const text = await file.text();
  if (text.length < 50) {
    showToast('Could not read resume text. Try a .docx or .pdf file.', { type: 'error' });
    return;
  }

  // Show loading state
  const card = document.getElementById('onboard-resume-first');
  const origHTML = card.querySelector('.btn.btn-primary').innerHTML;
  card.querySelector('.btn.btn-primary').innerHTML = '<span class="skel-line" style="width:80px;height:12px;display:inline-block;"></span> Analyzing…';
  card.querySelector('.btn.btn-primary').style.pointerEvents = 'none';

  try {
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch(SB_URL + '/functions/v1/extract-resume-profile', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'apikey': SB_ANON_KEY,
      },
      body: JSON.stringify({ resume_text: text }),
    });
    const data = await resp.json();
    
    if (data.error) {
      showToast('Profile extraction failed: ' + data.error, { type: 'error' });
      return;
    }

    _onboardProfile = data.profile;
    renderOnboardProfile(data.profile);
  } catch (e) {
    showToast('Could not extract profile: ' + e.message, { type: 'error' });
  } finally {
    card.querySelector('.btn.btn-primary').innerHTML = origHTML;
    card.querySelector('.btn.btn-primary').style.pointerEvents = '';
  }
};

function renderOnboardProfile(p) {
  const tag = (text) => `<span style="display:inline-block;padding:2px 8px;background:var(--bg-hover);border:1px solid var(--border);border-radius:5px;font-size:11px;color:var(--text);">${text}</span>`;

  document.getElementById('onboard-titles').innerHTML = (p.titles || []).map(tag).join('');
  document.getElementById('onboard-locations').innerHTML = (p.locations || []).map(tag).join('');
  document.getElementById('onboard-seniority').textContent = (p.seniority || 'unknown').replace('_', ' ');
  document.getElementById('onboard-industries').innerHTML = (p.industries || []).map(tag).join('');
  document.getElementById('onboard-skills').innerHTML = (p.skills || []).slice(0, 8).map(tag).join('');

  document.getElementById('onboard-profile-card').style.display = '';
  document.getElementById('onboard-profile-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

window.createFilterFromProfile = function() {
  if (!_onboardProfile) return;
  const p = _onboardProfile;

  // Build pills from profile
  const newFilter = {
    name: (p.titles?.[0] || 'My Search') + ' — auto-generated',
    whatPills: (p.titles || []).slice(0, 3).map(t => ({ values: [t], type: 'keyword' })),
    wherePills: (p.locations || []).slice(0, 2).map(l => ({ values: [l], type: 'location', locType: 'text' })),
    whenPills: [],
    whoPills: [],
    payPills: [],
    whatNotPills: [],
    whereNotPills: [],
    whoNotPills: [],
    includeNoSalary: true,
    includeRemote: p.remote_preference === 'remote',
    created: new Date().toISOString(),
  };

  // Add to saved filters
  savedFilters.push(newFilter);
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  invalidateCache(); // A14: clear query caches when filters change
  updateOnboardingStep(2);

  // EDE-001: Persist onboarding filter to Supabase + trigger enrichment
  if (currentUser && (newFilter.wherePills || []).length > 0) {
    sb.from('user_filters').insert({
      user_id: currentUser.id,
      name: newFilter.name || 'Untitled',
      filter_data: newFilter,
      sort_order: savedFilters.length - 1,
    }).select('id').single().then(function(r) {
      if (r.error) { reportError('app:onboarding-filter-persist', r.error); return; }
      if (r.data && r.data.id) {
        newFilter._id = r.data.id;
        if (typeof window.triggerLocationEnrichment === 'function') {
          window.triggerLocationEnrichment(newFilter.wherePills, r.data.id, !!newFilter.includeRemote);
        }
      }
    }).catch(function(e) { reportError('app:onboarding-filter-persist', e); });
  }

  // v6.04: Mark onboarding milestone
  if (typeof markOnboardingMilestone === 'function') markOnboardingMilestone('filter');

  // Navigate to Jobs page and run search
  showToast('Search created from your resume! Running your first search…', { type: 'success' });
  document.querySelector('[data-page=feed]').click();
  
  // Check the new filter and trigger search
  setTimeout(() => {
    if (typeof renderSavedFilters === 'function') renderSavedFilters();
    if (typeof searchJobs === 'function') searchJobs();
  }, 300);
};

// Q20: Onboarding milestone tracking
// Steps: 0=new, 1=resume uploaded, 2=filter created, 3=first search run, 4=pipeline used
function getOnboardingStep() {
  return parseInt(localStorage.getItem('bj_onboarding_step') || '0');
}

function updateOnboardingStep(step) {
  const current = getOnboardingStep();
  if (step > current) {
    localStorage.setItem('bj_onboarding_step', String(step));
    applyProgressiveNav(step);
  }
}

// Q21: Progressive nav disclosure
function applyProgressiveNav(step) {
  // Step 0-1: Show Get Started, Jobs, Settings only
  // Step 2+: Unlock Tuning, Resumes
  // Step 3+: Unlock Pipeline/Applications, Stats
  // Step 4+: Full nav
  const navItems = {
    'tuning': 2,
    'resumes': 1,
    'applications': 1,
    // FB-GHOST-BADGE-001: ghost nav item removed
    'stats': 1,
    'notifications': 2,
    'feedback': 1,
  };

  for (const [page, minStep] of Object.entries(navItems)) {
    const el = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (el) {
      if (step < minStep) {
        el.style.opacity = '0.35';
        el.style.pointerEvents = 'none';
        el.setAttribute('title', 'Complete onboarding to unlock');
      } else {
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.removeAttribute('title');
      }
    }
  }
}

// Init progressive nav on load
(function initOnboarding() {
  const step = getOnboardingStep();
  // Auto-detect milestones from existing data
  if (step < 1 && resumes && resumes.length > 0) updateOnboardingStep(1);
  if (step < 2 && savedFilters && savedFilters.length > 0) updateOnboardingStep(2);
  if (step < 3 && localStorage.getItem('bj_first_search_done')) updateOnboardingStep(3);
  if (step < 4 && localStorage.getItem('bj_pipeline_used')) updateOnboardingStep(4);
  
  applyProgressiveNav(getOnboardingStep());
  
  // Hide resume-first prompt if they already have filters
  if (savedFilters.length > 0) {
    const prompt = document.getElementById('onboard-resume-first');
    if (prompt) prompt.style.display = 'none';
  }
  
  // DS1-11: Update unified setup progress bar
  updateSetupProgress();
})();

// POD3-GS: BUG-2 — updateSetupProgress removed. Progress bar no longer exists on Get Started.
// Get Started is educational only; Setup Connections status bar is the single source of truth.
function updateSetupProgress() {
  // No-op — function preserved to prevent call-site errors from legacy callers
}







// ─── Referral Attribution (Phase 4 v5.10) ───
// Runs once per signup. Checks if user arrived via referral link.
async function processReferralAttribution(user) {
  // Only run if we haven't already attributed this user
  var attributed = localStorage.getItem('bj_referral_attributed');
  if (attributed === user.id) return;

  // Check for referral code from landing page capture
  var refCode = '';
  var refSource = 'direct';
  try {
    refCode = sessionStorage.getItem('bj_referral_code') || '';
    refSource = sessionStorage.getItem('bj_referral_source') || 'direct';
  } catch(e) { reportError('app:app', e); }

  // Also check cookie
  if (!refCode) {
    var match = document.cookie.match(/(^| )bj_ref=([^;]+)/);
    refCode = match ? decodeURIComponent(match[2]) : '';
    if (refCode) refSource = 'cookie_return';
  }

  if (!refCode) return; // No referral — skip

  // Get fingerprint if available
  var fingerprint = '';
  try { fingerprint = sessionStorage.getItem('bj_fingerprint') || ''; } catch(e) { reportError('app:app', e); }
  if (!fingerprint && window.bjFingerprint) {
    try { fingerprint = window.bjFingerprint.generate(); } catch(e) { reportError('app:app', e); }
  }

  // Call attribution RPC
  try {
    var { data, error } = await sb.rpc('process_referral_attribution', {
      p_referred_id: user.id,
      p_referral_code: refCode,
      p_ip_address: null, // IP captured server-side
      p_browser_fingerprint: fingerprint || null,
      p_source: refSource
    });

    if (error) {
      console.warn('[Referral] Attribution error:', error.message);
    } else {
      console.log('[Referral] Attribution result:', data);
    }
  } catch(e) { reportError('app', e); console.warn('[Referral] Attribution call failed:', e.message);
  }

  // Mark as attributed so we don't re-run
  localStorage.setItem('bj_referral_attributed', user.id);

  // Clean up
  try {
    sessionStorage.removeItem('bj_referral_code');
    sessionStorage.removeItem('bj_referral_source');
  } catch(e) { reportError('app:app', e); }
}

// CS-P1-004 FE-005: Register app.js exports with BJ namespace
(function() {
  ['togglePageHelp', 'connectGmail', 'disconnectGmail', 'switchAppTab',
   'handleOnboardResume', 'createFilterFromProfile', 'renderSettingsSummary',
   'updateQueueSectionVisibility'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'app', registered: Date.now() };
    }
  });
})();

// showPage / switchPage — navigate to a named page by simulating nav-item click
// Used in onclick= attributes throughout dashboard.html and resume-archive.js
window.showPage = function(pageName) {
  var navItem = document.querySelector('.nav-item[data-page="' + pageName + '"]');
  if (navItem) { navItem.click(); return; }
  // Fallback: directly activate page if no nav item (e.g. sub-pages)
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  var page = document.getElementById('page-' + pageName);
  if (page) page.classList.add('active');
};
window.switchPage = window.showPage;
window.BJ.switchPage = window.showPage;

// EDE-001: Trigger location enrichment after filter save with wherePills
window.triggerLocationEnrichment = async function(wherePills, filterId, includeRemote) {
  if (!wherePills || !wherePills.length || !currentUser) return;
  try {
    var session = await sb.auth.getSession();
    var token = session && session.data && session.data.session && session.data.session.access_token;
    if (!token) return;
    for (var i = 0; i < wherePills.length; i++) {
      var loc = (wherePills[i].values || [])[0];
      if (!loc) continue;
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/enrich-jd-location', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ location: loc, filter_id: filterId || null, include_remote: !!includeRemote }),
        });
        if (!res.ok) continue;
        var data = await res.json();
        if (data.status !== 'complete' && !data.cached && data.jobs_total > 0) {
          showEnrichmentPopup(data);
        }
        if (window.posthog) {
          posthog.capture('enrichment_triggered', {
            location_key: data.location_key,
            jobs_total: data.jobs_total,
            cached: !!data.cached,
          });
        }
      } catch(e) { reportError('app:enrich-trigger-pill', e); }
    }
  } catch(e) { reportError('app:enrich-trigger', e); }
};

// EDE-001: Show enrichment confirmation popup
function showEnrichmentPopup(data) {
  var existing = document.getElementById('enrichment-popup');
  if (existing) existing.remove();

  var etaLabel = 'less than 30 minutes';
  if (data.estimated_at) {
    var mins = Math.round((new Date(data.estimated_at) - Date.now()) / 60000);
    if (mins > 90) etaLabel = 'about ' + Math.round(mins / 60) + ' hours';
    else if (mins > 30) etaLabel = 'about ' + Math.round(mins / 30) * 30 + ' minutes';
  }

  var popup = document.createElement('div');
  popup.id = 'enrichment-popup';
  popup.style.cssText = [
    'position:fixed;bottom:80px;right:24px;z-index:9000;',
    'background:var(--bg-card);border:1px solid var(--border);border-radius:12px;',
    'padding:14px 16px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.15);',
    'animation:fadeIn .2s ease;',
  ].join('');
  popup.innerHTML = [
    '<div style="display:flex;align-items:flex-start;gap:10px;">',
    '<span style="font-size:18px;line-height:1;">🔍</span>',
    '<div style="flex:1;min-width:0;">',
    '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:2px;">Reviewing jobs in ' + escapeHtml(data.loc_display || data.location_key) + '</div>',
    '<div style="font-size:12px;color:var(--text-dim);">Found ' + (data.jobs_total || 0).toLocaleString() + ' jobs · ready in ' + etaLabel + '</div>',
    '</div>',
    '<button onclick="var ep=document.getElementById(&quot;enrichment-popup&quot;);if(ep)ep.remove();if(window.posthog)posthog.capture(&quot;enrichment_popup_dismissed&quot;)" ',
    'style="background:none;border:none;cursor:pointer;color:var(--text-faint);font-size:16px;line-height:1;padding:0 0 0 4px;">×</button>',
    '</div>',
  ].join('');
  document.body.appendChild(popup);

  if (window.posthog) {
    var etaMins = data.estimated_at ? Math.round((new Date(data.estimated_at) - Date.now()) / 60000) : 0;
    posthog.capture('enrichment_popup_shown', { location_key: data.location_key, eta_minutes: etaMins });
  }

  setTimeout(function() {
    var el = document.getElementById('enrichment-popup');
    if (el) el.remove();
  }, 8000);
}

// EDE-001: Load enrichment_requests on dashboard init and provide badge helper
var _enrichmentRequests = [];

async function loadEnrichmentStatus() {
  if (!currentUser) return;
  try {
    var cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    var { data } = await sb
      .from('enrichment_requests')
      .select('location_key, loc_display, status, jobs_total, jobs_enriched, estimated_at')
      .eq('user_id', currentUser.id)
      .gt('requested_at', cutoff);
    _enrichmentRequests = data || [];
  } catch(e) { /* non-critical — silently ignore */ }
}

window._enrichmentBadgeHtml = function(sf) {
  if (!_enrichmentRequests.length) return '';
  var pills = sf.wherePills || [];
  if (!pills.length) return '';
  // Find matching enrichment request for any where pill
  for (var i = 0; i < pills.length; i++) {
    var loc = (pills[i].values || [])[0];
    if (!loc) continue;
    var lower = loc.toLowerCase().replace(/[.,]/g,'').trim();
    var req = _enrichmentRequests.find(function(r) {
      return r.loc_display.toLowerCase() === lower ||
             r.location_key.includes(lower.replace(/[ ]/g, '-'));
    });
    if (!req) continue;
    if (req.status === 'complete') {
      return '<div style="font-size:10px;color:var(--green);font-weight:600;margin-top:1px;">✓ Up to date</div>';
    }
    if (req.status === 'processing' || req.status === 'queued') {
      var etaStr = '';
      if (req.estimated_at) {
        var mins = Math.round((new Date(req.estimated_at) - Date.now()) / 60000);
        if (mins > 0) etaStr = ' · ~' + (mins > 60 ? Math.round(mins/60) + 'h' : mins + 'min');
      }
      return '<div style="font-size:10px;color:var(--warm);font-weight:600;margin-top:1px;">🔍 Reviewing' + etaStr + '</div>';
    }
  }
  return '';
};

// Dashboard version check — shows banner if server has newer version
(async function checkDashboardVersion() {
  try {
    var resp = await fetch('/js/version.js?_t=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) return;
    var text = await resp.text();
    var match = text.match(/BJ_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (!match) return;
    var serverVersion = match[1];
    var loadedVersion = typeof BJ_VERSION !== 'undefined' ? BJ_VERSION : '';
    if (serverVersion && loadedVersion && serverVersion !== loadedVersion) {
      var banner = document.createElement('div');
      banner.id = 'version-update-banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;padding:10px 20px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.2);';
      banner.innerHTML = 'Dashboard update available: <strong>' + loadedVersion + '</strong> → <strong>' + serverVersion + '</strong>' +
        '<button onclick="window.location.href=window.location.pathname+\'?v=\'+Date.now()" style="background:#fff;color:#3b82f6;border:none;border-radius:6px;padding:4px 14px;font-size:12px;font-weight:600;cursor:pointer;margin-left:8px;">Refresh Now</button>' +
        '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:16px;margin-left:auto;">✕</button>';
      document.body.prepend(banner);
    }
  } catch(e) { /* silent — version check is best-effort */ }
})();

// QA-009/QA-012: Browse button chunk-loading guard
// Browse handlers are in browsers.js (keywords chunk). If user clicks a browse
// button before the chunk loads, nothing happens. This delegated handler
// ensures the chunk loads first, then re-fires the click.
(function() {
  var _browseGuardActive = false;
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.browse-companies-btn');
    if (!btn || _browseGuardActive) return;
    // If openCompanyBrowser exists, browsers.js has loaded — let its handler run
    if (typeof window.openFilterBrowser === 'function') return;
    // Chunk not loaded yet — load it, then re-click
    e.stopPropagation();
    if (typeof bjLoadChunk === 'function') {
      _browseGuardActive = true;
      bjLoadChunk('keywords').then(function() {
        _browseGuardActive = false;
        btn.click();
      }).catch(function() { _browseGuardActive = false; });
    }
  }, true); // useCapture to fire before browsers.js handlers
})();

// QA-015/016: Dynamic merch card — fetches from merch_content and rotates
(async function() {
  var card = document.getElementById('intel-card-merch');
  if (!card || typeof sb === 'undefined') return;
  try {
    // 1. Get placement
    var { data: placements } = await sb.from('merch_placements')
      .select('id').eq('element_id', 'intel-card-merch').eq('is_active', true).limit(1);
    if (!placements || !placements.length) return;

    // 2. Get active rules for this placement
    var { data: rules } = await sb.from('merch_rules')
      .select('id').eq('placement_id', placements[0].id).eq('is_active', true).order('priority');
    if (!rules || !rules.length) return;

    // 3. Get content entries
    var ruleIds = rules.map(function(r) { return r.id; });
    var { data: entries } = await sb.from('merch_content')
      .select('content,sort_order').in('rule_id', ruleIds).eq('is_active', true).order('sort_order');
    if (!entries || !entries.length) return;

    // 4. Rotate: increment session index each page load
    var idx = parseInt(sessionStorage.getItem('bj_merch_idx') || '0') % entries.length;
    sessionStorage.setItem('bj_merch_idx', String(idx + 1));
    var c = entries[idx].content;

    // 5. Populate card
    var colorMap = { green: 'var(--green)', accent: 'var(--accent)', red: 'var(--red)', warm: 'var(--warm)' };
    var color = colorMap[c.type_color] || 'var(--accent)';
    var dimColor = c.type_color === 'green' ? 'rgba(34,197,94,0.1)' : 'var(--accent-dim)';

    var typeEl = card.querySelector('.intel-card-type');
    var titleEl = document.getElementById('intel-merch-title');
    var subEl = document.getElementById('intel-merch-sub');
    var ctaEl = card.querySelector('.intel-card-cta');

    if (typeEl) { typeEl.textContent = c.type_label || 'Pro Tip'; typeEl.style.background = dimColor; typeEl.style.color = color; }
    if (titleEl) titleEl.textContent = c.title || '';
    if (subEl) subEl.textContent = c.sub || '';
    if (ctaEl) {
      ctaEl.textContent = c.cta_text || '';
      ctaEl.onclick = function(e) {
        e.preventDefault();
        if (c.cta_action && c.cta_action.startsWith('nav:')) {
          var page = c.cta_action.replace('nav:', '');
          var navBtn = document.querySelector('[data-page=' + page + ']');
          if (navBtn) navBtn.click();
        } else if (c.cta_action && c.cta_action.startsWith('url:')) {
          window.open(c.cta_action.replace('url:', ''), '_blank');
        }
      };
    }
    if (window.posthog) posthog.capture('merch_impression', {
      slot: 'feed-intel', content_title: c.title, sort_order: entries[idx].sort_order
    });
  } catch (e) {
    if (typeof reportError === 'function') reportError('merch:feed-intel', e);
  }
})();
