const BJ_VERSION = 'v4.21';
console.log('[BJ] Dashboard ' + BJ_VERSION + ' loaded — Phase T8: Resume-first onboarding + copy fixes');

// Auth
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }
  currentUser = session.user;
  // Persist account flag for landing page segment detection (survives logout)
  localStorage.setItem('bj_has_account', 'true');
  const vEl = document.getElementById('nav-version');
  if (vEl) vEl.textContent = BJ_VERSION;

// Pre-warm static ref table caches (v3.84)
if (typeof prewarmRefCaches === 'function') prewarmRefCaches();

// Error recovery & offline resilience (v3.87)
if (typeof initOfflineDetection === 'function') initOfflineDetection();
if (typeof initGlobalErrorHandlers === 'function') initGlobalErrorHandlers();

// Session management hardening (v3.90)
if (typeof initSessionManagement === 'function') initSessionManagement();
  let profile = null;
  try {
    const { data: p } = await sb.from('profiles').select('approved,cohort_id,plan,role').eq('id', currentUser.id).single();
    profile = p;
    if (!p?.approved) { window.location.href = '/?pending=1'; return; }
    currentUser._cohortId = p.cohort_id || null;
    window._bjUserPlan = p.plan || 'free';
    window._bjUserRole = p.role || 'user';
  } catch (e) { if (typeof toastError === 'function') toastError('Failed to load your profile. Please refresh the page.'); }
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
  // Update nav tier badge based on profile role/plan
  const navPlanEl = document.querySelector('.nav-user-plan');
  if (navPlanEl && profile) {
    if (profile.role === 'admin') {
      navPlanEl.textContent = 'ADMIN';
      navPlanEl.style.color = '#f59e0b';
      navPlanEl.style.fontWeight = '700';
      navPlanEl.style.letterSpacing = '1px';
    } else if ((profile.plan || 'free') === 'pro') {
      navPlanEl.textContent = 'Pro Plan';
      navPlanEl.style.color = '#3b82f6';
      navPlanEl.style.fontWeight = '600';
    } else if ((profile.plan || 'free') === 'enterprise') {
      navPlanEl.textContent = 'Enterprise';
      navPlanEl.style.color = '#8b5cf6';
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
  // Pipeline now loaded from Supabase (Ghost Build Phase 1)
  // savedJobIds and appliedJobIds are populated by initPipeline()
  savedJobIds = [];
  appliedJobIds = [];
  resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');
  // Initialize Supabase pipeline (migrate localStorage → Supabase on first run)
  if (typeof initPipeline === 'function') await initPipeline();
  // Trigger sparkle flourish
  setTimeout(() => { $('#nav-brand').classList.add('sparkle-active'); }, 100);
  // Initialize billing (credit balance, pricing, payment return check)
  if (typeof initBilling === 'function') initBilling();
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
    if (item.dataset.page === 'feedback' && typeof initCannyFeedback === 'function') initCannyFeedback();
    if (item.dataset.page === 'ghost' && typeof renderGhostMonitor === 'function') renderGhostMonitor();
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
  if (lastTab === 'feedback' && typeof initCannyFeedback === 'function') initCannyFeedback();
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

// ============================================================
// GMAIL OAUTH — Connect / Disconnect / Status
// ============================================================

async function initGmailStatus() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const { data: conn } = await sb.from('gmail_connections')
      .select('gmail_address, sync_status')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const isConnected = conn && conn.sync_status === 'active';
    updateGmailUI(isConnected, conn?.gmail_address || '');
  } catch (e) {
    console.warn('[BJ] Gmail status check failed:', e.message);
  }
}

function updateGmailUI(connected, email) {
  // Setup page
  const setupConn = $('#gmail-setup-connected');
  const setupDisc = $('#gmail-setup-disconnected');
  const setupAddr = $('#gmail-address');
  const setupDot = $('#gmail-dot');
  if (setupConn && setupDisc) {
    setupConn.style.display = connected ? '' : 'none';
    setupDisc.style.display = connected ? 'none' : '';
    if (setupAddr) setupAddr.textContent = email;
    if (setupDot) setupDot.className = 'setup-dot' + (connected ? ' connected' : '');
  }
  // Ghost monitor page
  const ghostConn = $('#ghost-gmail-connected');
  const ghostBtn = $('#gmail-connect-btn');
  const ghostAddr = $('#ghost-gmail-address');
  const gmailCard = $('#g-gmail-card');
  if (ghostConn) ghostConn.style.display = connected ? '' : 'none';
  if (ghostBtn) ghostBtn.style.display = connected ? 'none' : '';
  if (ghostAddr) ghostAddr.textContent = email;
  if (gmailCard) {
    const valEl = gmailCard.querySelector('.stat-val');
    if (valEl) { valEl.textContent = connected ? 'Connected' : 'Not Connected'; valEl.style.color = connected ? 'var(--green)' : 'var(--text-faint)'; }
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
  if (!confirm('Disconnect Gmail? Ghost Monitor will lose email-based detection.')) return;
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
  } else if (gmail === 'denied') {
    showToast('Gmail connection was cancelled.', { type: 'info' });
  } else if (gmail === 'error') {
    showToast('Gmail connection failed. Please try again.', { type: 'error' });
  }
})();

// Init Gmail status on load
initGmailStatus();






