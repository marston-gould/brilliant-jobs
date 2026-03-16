/* ───────────────────────────────────────────────────────────
   admin.js — Admin Console with Sidebar Navigation (IA v2)
   v7.43 — CS-P1-017: Compliance dashboard (PII map, deletion, export)
   5 sections: Operations, Growth, Audience, Business, Compliance
   37 sub-pages with lazy initialization
   ─────────────────────────────────────────────────────────── */

// ─── Admin access gate (dashboard nav-item visibility) ───
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
    }).catch(function(e) { console.error('[Admin] Profile query failed:', e); if (typeof reportError === 'function') reportError('admin-init', e); if (typeof toastWarning === 'function') toastWarning('Admin profile check failed'); });
  }).catch(function(e) { console.error('[Admin] getUser failed:', e); if (typeof reportError === 'function') reportError('admin-init', e); if (typeof toastWarning === 'function') toastWarning('Admin auth check failed'); });
}

// ─── AD-FIX-07: Audit Trail Helper (CS-012) ───
// Async fire-and-forget per AD-ADR-004 — never blocks the caller
function _logAdminAction(action, resourceType, resourceId, details) {
  try {
    if (typeof sb === 'undefined') return;
    var userId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
    sb.from('audit_log').insert({
      user_id: userId,
      action: action,
      resource_type: resourceType || null,
      resource_id: resourceId ? String(resourceId) : null,
      details: details || {},
      user_agent: navigator.userAgent
    }).then(function(res) {
      if (res.error) console.warn('[Audit] insert failed:', res.error.message);
    }).catch(function(e) {
      console.warn('[Audit] insert error:', e);
    });
  } catch(e) {
    // Fire-and-forget — never throw
    reportError('admin', e);
    console.warn('[Audit] error:', e);
  }
}
window._logAdminAction = _logAdminAction;

// ═══════════════════════════════════════════════════════════
// ADMIN SUBPAGE MAP — 36 sub-pages across 5 sections
// ═══════════════════════════════════════════════════════════

var ADMIN_SUBPAGE_MAP = {
  // ── Operations ──
  'feed-health':    { section: 'operations',  label: 'Feed Health',    init: function(){ loadBoardHealth(); } },
  'enrichment':     { section: 'operations',  label: 'Enrichment',     init: function(){ loadEnrichmentTab(); } },
  'companies':      { section: 'operations',  label: 'Companies',      init: function(){ loadAdminCompanies(); } },
  'jobs':           { section: 'operations',  label: 'Jobs',           init: function(){ loadAdminJobs(); } },
  'ghost':          { section: 'operations',  label: 'Ghost Detection',init: function(){ loadGhostTab(); } },
  'cache':          { section: 'operations',  label: 'Cache Health',   init: function(){ refreshCacheHealthPanel(); } },
  'signals':        { section: 'operations',  label: 'Signals',        init: function(){ loadAdminSignals(); } },
  'cron':           { section: 'operations',  label: 'Cron Health',    init: function(){ loadCronPanel(); } },
  'monitoring':     { section: 'operations',  label: 'Monitoring',     init: function(){ loadMonitoringPanel(); } },
  'alerts':         { section: 'operations',  label: 'Alerts',         init: function(){ loadAlertsPanel(); } },
  'error-replay':   { section: 'operations',  label: 'Error Replay',   init: function(){ loadErrorReplayPanel(); } },
  'client-errors':  { section: 'operations',  label: 'Client Errors',  init: function(){ loadClientErrorsPanel(); } },
  'ef-health':      { section: 'operations',  label: 'EF Health',      init: function(){ loadEfHealthPanel(); } },
  'db-activity':    { section: 'operations',  label: 'DB Activity',    init: function(){ loadDbActivityPanel(); } },
  'posthog-insights':{ section: 'operations',  label: 'PostHog Insights',init: function(){ loadPostHogInsightsPanel(); } },
  'ab-tests':        { section: 'operations',  label: 'A/B Tests',       init: function(){ loadAbTestsPanel(); } },
  'kill-switch':    { section: 'operations',  label: 'Kill Switch',    init: function(){ loadKillSwitchPanel(); } },
  'crewai':         { section: 'operations',  label: 'CrewAI Agents',  init: function(){ loadCrewAIPanel(); } },
  'build-analytics':{ section: 'operations',  label: 'Build Analytics', init: function(){ loadBuildAnalyticsPanel(); } },
  'deploy-visibility':{ section: 'operations',  label: 'Deploy Visibility', init: function(){ loadDeployVisibilityPanel(); } },
  'deploy-alerting': { section: 'operations',  label: 'Deploy Alerting',   init: function(){ loadDeployAlertingPanel(); } },
  'command-center':  { section: 'operations',  label: 'Command Center',    init: function(){ loadCommandCenterPanel(); } },
  'deploy-reports':  { section: 'operations',  label: 'DORA Reports',      init: function(){ loadDeployReportsPanel(); } },
  'auto-submit':     { section: 'operations',  label: 'Auto-Submit',       init: function(){ loadAutoSubmitPanel(); } },
  // ── Growth ──
  'seo':            { section: 'growth',      label: 'SEO',            init: function(){ loadSeoTab(); } },
  'content':        { section: 'growth',      label: 'Content',        init: function(){ loadContentTab(); } },
  'email':          { section: 'growth',      label: 'Email',          init: function(){ loadAdminEmail(); } },
  'merch':          { section: 'growth',      label: 'Merchandising',  init: function(){ loadMerchTab(); } },
  'notifications':  { section: 'growth',      label: 'Notifications',  init: function(){ loadNotificationsTab(); } },
  'templates':      { section: 'growth',      label: 'Templates',      init: function(){ loadTemplatesTab(); } },
  'notif-analytics':{ section: 'growth',      label: 'Notif Analytics', init: function(){ loadNotifAnalyticsTab(); } },
  'email-cohorts':  { section: 'growth',      label: 'Email Cohorts',  init: function(){ loadEmailCohortsTab(); } },
  'cadence':        { section: 'growth',      label: 'Cadence',        init: function(){ loadCadenceTab(); } },
  'notif-log':      { section: 'growth',      label: 'Notif Log',      init: function(){ loadNotifLogTab(); } },
  'referrals':      { section: 'growth',      label: 'Referrals',      init: function(){ loadReferralsAdminTab(); } },
  'payl':           { section: 'growth',      label: 'PAYL Analytics',  init: function(){ loadPaylAnalyticsPanel(); } },
  'paid':           { section: 'growth',      label: 'Paid',           init: function(){ loadPaidTab(); } },
  'social':         { section: 'growth',      label: 'Social',         init: function(){ loadSocialTab(); } },
  'analytics':      { section: 'growth',      label: 'Analytics',      init: function(){ loadAnalyticsOverviewTab(); } },
  // ── Audience ──
  'cohorts':        { section: 'audience',    label: 'Cohorts',        init: function(){ loadCohortTab(); } },
  'entitlements':   { section: 'audience',    label: 'Entitlements',   init: function(){ loadEntitlementsTab(); } },
  'users':          { section: 'audience',    label: 'User Manager',   init: function(){ loadUsersTab(); } },
  'cohort-manager': { section: 'audience',    label: 'Cohort Manager', init: function(){ loadCohortManagerTab(); } },
  'feedback':       { section: 'audience',    label: 'Feedback',       init: function(){ loadFeedbackTab(); } },
  'cohort-pricing': { section: 'audience',    label: 'Cohort Pricing', init: function(){ loadCohortPricingPanel(); } },
  // ── Business ──
  'revenue':        { section: 'business',    label: 'Revenue',        init: function(){ loadRevenueTab(); } },
  'stripe':         { section: 'business',    label: 'Stripe',         init: function(){ loadStripeTab(); } },
  'subscription':   { section: 'business',    label: 'Subscriptions',  init: function(){ loadSubscriptionTab(); } },
  'costs':          { section: 'business',    label: 'Costs',          init: function(){ loadCostsTab(); } },
  'forecasting':    { section: 'business',    label: 'Forecasting',    init: function(){ loadForecastingTab(); } },
  // ── Compliance (CS-P1-017) ──
  'pii-map':        { section: 'compliance',   label: 'PII Data Map',   init: function(){ loadPiiMapPanel(); } },
  'user-deletion':  { section: 'compliance',   label: 'User Deletion',  init: function(){ loadUserDeletionPanel(); } },
  'compliance-dash':{ section: 'compliance',   label: 'Compliance',     init: function(){ loadComplianceDashPanel(); } }
};

var ADMIN_SECTIONS = [
  { key: 'operations', label: 'Operations',  icon: '<i data-lucide="settings" class="icon-sm icon-stroke"></i>' },
  { key: 'growth',     label: 'Growth',      icon: '<i data-lucide="trending-up" class="icon-sm icon-stroke"></i>' },
  { key: 'audience',   label: 'Audience',    icon: '<i data-lucide="users" class="icon-sm icon-stroke"></i>' },
  { key: 'business',   label: 'Business',    icon: '<i data-lucide="wallet" class="icon-sm icon-stroke"></i>' },
  { key: 'compliance', label: 'Compliance',  icon: '<i data-lucide="shield-check" class="icon-sm icon-stroke"></i>' }
];

// ─── Nav state ───
var _adminNavState = null; // { active, collapsed: {} }
var _adminTabInit = {};
var adminPeriod = parseInt(localStorage.getItem('bj_admin_period')) || 168;
// Keep legacy alias for any code referencing adminActiveTab
var adminActiveTab = 'feed-health';

function _loadAdminNavState() {
  try {
    var raw = localStorage.getItem('bj_admin_state');
    if (raw) { _adminNavState = JSON.parse(raw); }
  } catch(e) { /* CS-016: localStorage may be unavailable (private browsing); defaults apply */ }
  if (!_adminNavState) {
    _adminNavState = { active: 'feed-health', collapsed: {} };
  }
  adminActiveTab = _adminNavState.active || 'feed-health';
}

function _saveAdminNavState() {
  try {
    localStorage.setItem('bj_admin_state', JSON.stringify(_adminNavState));
    // Keep legacy key in sync
    localStorage.setItem('bj_admin_tab', _adminNavState.active);
  } catch(e) { /* CS-016: localStorage may be unavailable */ }
}

// ─── Build Sidebar ───
function _buildAdminSidebar() {
  var sidebar = document.getElementById('admin-sidebar');
  if (!sidebar) return;

  var html = '';
  ADMIN_SECTIONS.forEach(function(sec) {
    var isCollapsed = _adminNavState.collapsed[sec.key];
    var expandedClass = isCollapsed ? '' : ' expanded';

    html += '<div class="admin-sidebar-section' + expandedClass + '" data-section="' + sec.key + '">';
    html += '<div class="admin-sidebar-header" data-section-toggle="' + sec.key + '">';
    html += '<span>' + sec.label + '</span>';
    html += '<i data-lucide="chevron-right" class="admin-sidebar-chevron icon-stroke"></i>';
    html += '</div>';
    html += '<div class="admin-sidebar-items">';

    // Get sub-pages in this section (ordered by ADMIN_SUBPAGE_MAP insertion order)
    Object.keys(ADMIN_SUBPAGE_MAP).forEach(function(key) {
      var sp = ADMIN_SUBPAGE_MAP[key];
      if (sp.section !== sec.key) return;
      var isDisabled = sp.init === null && !document.getElementById('admin-panel-' + key);
      var cls = 'admin-sidebar-item';
      if (isDisabled) cls += ' disabled';
      html += '<div class="' + cls + '" data-subpage="' + key + '">' + sp.label + '</div>';
    });

    html += '</div></div>';
  });

  sidebar.innerHTML = html;

  // Wire section toggle
  sidebar.querySelectorAll('[data-section-toggle]').forEach(function(hdr) {
    hdr.addEventListener('click', function() {
      var secKey = this.getAttribute('data-section-toggle');
      var secEl = sidebar.querySelector('[data-section="' + secKey + '"]');
      if (!secEl) return;
      secEl.classList.toggle('expanded');
      _adminNavState.collapsed[secKey] = !secEl.classList.contains('expanded');
      _saveAdminNavState();
    });
  });

  // Wire sub-page clicks
  sidebar.querySelectorAll('[data-subpage]').forEach(function(item) {
    item.addEventListener('click', function() {
      if (this.classList.contains('disabled')) return;
      var key = this.getAttribute('data-subpage');
      if (key === _adminNavState.active) return; // don't re-init
      navigateAdminSubpage(key);
    });
  });
}

// ─── Navigate to sub-page ───
function navigateAdminSubpage(key) {
  var sp = ADMIN_SUBPAGE_MAP[key];
  if (!sp) return;

  // Update active state in sidebar
  var sidebar = document.getElementById('admin-sidebar');
  if (sidebar) {
    sidebar.querySelectorAll('.admin-sidebar-item').forEach(function(item) {
      item.classList.toggle('active', item.getAttribute('data-subpage') === key);
    });
    // Ensure parent section is expanded
    var secEl = sidebar.querySelector('[data-section="' + sp.section + '"]');
    if (secEl && !secEl.classList.contains('expanded')) {
      secEl.classList.add('expanded');
      _adminNavState.collapsed[sp.section] = false;
    }
  }

  // Update breadcrumb + title
  var sectionLabel = '';
  ADMIN_SECTIONS.forEach(function(s) { if (s.key === sp.section) sectionLabel = s.label; });
  var bc = document.getElementById('admin-breadcrumb');
  if (bc) bc.textContent = sectionLabel + ' > ' + sp.label;
  var title = document.getElementById('admin-page-title');
  if (title) title.textContent = sp.label;

  // Cleanup any timers from previous tab (e.g. cron auto-refresh, kill-switch auto-refresh)
  if (typeof _cleanupCronPanel === 'function') _cleanupCronPanel();
  if (typeof _cleanupKillSwitchPanel === 'function') _cleanupKillSwitchPanel();
  if (typeof _cleanupMonitoringPanel === 'function') _cleanupMonitoringPanel();
  if (typeof _cleanupAlertsPanel === 'function') _cleanupAlertsPanel();
  if (typeof _cleanupErrorReplayPanel === 'function') _cleanupErrorReplayPanel();
  if (typeof _cleanupEfHealthPanel === 'function') _cleanupEfHealthPanel();
  if (typeof _cleanupPostHogInsights === 'function') _cleanupPostHogInsights();
  if (typeof _cleanupDbActivityPanel === 'function') _cleanupDbActivityPanel();
  if (typeof _cleanupUserDeletionPanel === 'function') _cleanupUserDeletionPanel();

  // Show correct panel, hide all others
  document.querySelectorAll('.admin-panel').forEach(function(p) {
    p.classList.remove('active');
  });
  var panel = document.getElementById('admin-panel-' + key);
  if (panel) panel.classList.add('active');

  // Persist
  _adminNavState.active = key;
  adminActiveTab = key;
  _saveAdminNavState();

  // Lazy-init with error boundary + loading state (CS-016: AD-FIX-10)
  if (!_adminTabInit[key] && sp.init) {
    _adminTabInit[key] = true;
    // CS-016: Show loading state
    if (panel) {
      var existingContent = panel.innerHTML;
      var loadingEl = document.createElement('div');
      loadingEl.className = 'admin-loading-state';
      loadingEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:16px;color:var(--text-dim);font-size:13px;">' +
        '<span class="admin-spinner" style="display:inline-block;width:16px;height:16px;border:2px solid var(--border);border-top-color:var(--accent,#6b82a8);border-radius:50%;animation:spin 0.6s linear infinite;"></span>' +
        'Loading ' + sp.label + '…</div>';
      panel.prepend(loadingEl);
    }
    try {
      sp.init();
    } catch (err) {
      console.error('[Admin] Section init error (' + key + '):', err);
      if (typeof reportError === 'function') reportError('admin-section-' + key, err);
      _adminTabInit[key] = false; // allow retry
      if (panel) {
        panel.innerHTML = '<div style="padding:24px;text-align:center;">' +
          '<div style="color:var(--danger,#ef4444);font-weight:600;margin-bottom:8px;">⚠ Failed to load ' + sp.label + '</div>' +
          '<div style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">' + (err.message || 'Unknown error') + '</div>' +
          '<button onclick="navigateAdminSubpage(\'' + key + '\')" style="padding:6px 16px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);cursor:pointer;font-size:13px;">Retry</button>' +
          '</div>';
      }
    }
    // Remove loading state
    if (panel) {
      var loader = panel.querySelector('.admin-loading-state');
      if (loader) loader.remove();
    }
    // POD3-LUCIDE: Re-initialize Lucide icons after panel content loads
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }
}

// ─── Init ───
function initAdminPage() {
  var page = document.getElementById('page-admin');
  if (!page) {
    console.log('[Admin] page-admin not found, skipping');
    return;
  }
  if (typeof currentUser === 'undefined' || !currentUser) {
    console.log('[Admin] waiting for auth, deferring load');
    _adminTabInit = {};
    return;
  }
  console.log('[Admin] initAdminPage called — IA v2 sidebar');
  initAdminNav();
}

function initAdminNav() {
  _loadAdminNavState();
  _buildAdminSidebar();
  // v7.19: Set admin console version in topbar
  var adminVerEl = document.getElementById('admin-version');
  if (adminVerEl) {
    adminVerEl.textContent = (typeof BJ_VERSION !== 'undefined' ? BJ_VERSION : 'v7.19');
  }

  // Period toggle for Revenue tab (keep existing wiring)
  var revPeriod = document.getElementById('admin-rev-period');
  if (revPeriod) {
    revPeriod.addEventListener('click', function(e) {
      var btn = e.target.closest('.admin-period-btn');
      if (!btn) return;
      revPeriod.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      _adminTabInit['revenue'] = false;
      loadRevenueTab(parseInt(btn.dataset.revDays));
    });
  }

  // Navigate to persisted sub-page
  navigateAdminSubpage(_adminNavState.active);
}

// Legacy compat: switchAdminTab still works
function switchAdminTab(tabId) {
  navigateAdminSubpage(tabId);
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
    // Load refresh cycle status (independent of period)
    loadRefreshCycle();

    var snapshot = await sb.rpc('get_board_health', { period_hours: adminPeriod });
    console.log('[Admin] RPC data:', snapshot.data);
    if (snapshot.error) {
      console.error('[Admin] RPC error:', snapshot.error);
      var healthEl = document.getElementById('admin-health');
      if (healthEl) healthEl.innerHTML = '<span class="admin-red">⚠ Feed health data unavailable — ' + escapeHtml(snapshot.error.message || 'unknown error') + '</span> <button onclick="_adminTabInit[\'feed-health\']=false;loadBoardHealth()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">Retry</button>';
      return;
    }
    var d = snapshot.data;
    if (!d) return;

    setAdminText('ah-total', fmtAdminNum(d.total_feeds));
    setAdminText('ah-with-jobs', fmtAdminNum(d.feeds_with_jobs));
    setAdminText('ah-4xx', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-dead', fmtAdminNum(d.feeds_4xx));
    setAdminText('ah-unscraped', fmtAdminNum(d.feeds_never_scraped || 0));
    setAdminText('ah-jobs', fmtAdminNum(d.total_jobs));

    var net = (d.jobs_added || 0) - (d.jobs_lost || 0);
    setAdminText('ah-net', (net >= 0 ? '+' : '') + fmtAdminNum(net));

    setDelta('ah-total-delta', d.boards_added, '+');
    setDelta('ah-with-jobs-delta', null);
    setDelta('ah-4xx-delta', d.boards_lost, '+', true);
    setDelta('ah-dead-delta', null);
    setDelta('ah-unscraped-delta', null);
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
      var tfoot = document.getElementById('admin-platform-foot');
      if (tbody) {
        var totBoards = 0, totWithJobs = 0, totDead = 0, totUnscraped = 0, totJobs = 0;
        tbody.innerHTML = platform.data.map(function(p) {
          var activePct = p.total > 0 ? Math.round((p.with_jobs / p.total) * 100) : 0;
          var pctColor = activePct >= 50 ? 'admin-green' : activePct >= 25 ? 'admin-amber' : 'admin-red';
          var jpb = p.with_jobs > 0 ? Math.round(p.jobs / p.with_jobs) : 0;
          var dead = p.dead || 0;
          var unscraped = p.never_scraped || 0;
          totBoards += p.total; totWithJobs += p.with_jobs; totDead += dead; totUnscraped += unscraped; totJobs += p.jobs;
          return '<tr>' +
            '<td class="admin-platform-name">' + (p.platform || 'unknown') + '</td>' +
            '<td>' + fmtAdminNum(p.total) + '</td>' +
            '<td class="' + pctColor + '">' + activePct + '%</td>' +
            '<td class="' + (dead > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(dead) + '</td>' +
            '<td class="' + (unscraped > 0 ? 'admin-amber' : '') + '">' + fmtAdminNum(unscraped) + '</td>' +
            '<td>' + fmtAdminNum(p.jobs) + '</td>' +
            '<td style="font-family:var(--mono)">' + fmtAdminNum(jpb) + '</td>' +
            '</tr>';
        }).join('');
        if (tfoot) {
          var totPct = totBoards > 0 ? Math.round((totWithJobs / totBoards) * 100) : 0;
          var totJpb = totWithJobs > 0 ? Math.round(totJobs / totWithJobs) : 0;
          tfoot.innerHTML = '<tr style="font-weight:600;border-top:2px solid var(--border)">' +
            '<td>Total</td>' +
            '<td>' + fmtAdminNum(totBoards) + '</td>' +
            '<td>' + totPct + '%</td>' +
            '<td class="' + (totDead > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(totDead) + '</td>' +
            '<td class="' + (totUnscraped > 0 ? 'admin-amber' : '') + '">' + fmtAdminNum(totUnscraped) + '</td>' +
            '<td>' + fmtAdminNum(totJobs) + '</td>' +
            '<td style="font-family:var(--mono)">' + fmtAdminNum(totJpb) + '</td>' +
            '</tr>';
        }
      }
    }

    // Load feed health charts
    loadFeedHealthCharts().catch(function(e) { console.warn('[Admin] Feed health charts failed:', e.message); if (typeof reportError === 'function') reportError('admin-feed-health', e); if (typeof toastWarning === 'function') toastWarning('Feed health charts failed'); });
    // Load discovery pipeline + auto-apply stats (isolated to prevent cascading failures)
    loadDiscoveryPipelineStats().catch(function(e) { console.warn('[Admin] Discovery pipeline stats failed:', e.message); if (typeof reportError === 'function') reportError('admin-discovery', e); if (typeof toastWarning === 'function') toastWarning('Discovery pipeline stats failed'); });
    loadAutoApplyStats().catch(function(e) { console.warn('[Admin] Auto-apply stats failed:', e.message); if (typeof reportError === 'function') reportError('admin-autoapply', e); if (typeof toastWarning === 'function') toastWarning('Auto-apply stats failed'); });
    // A15 S5: Show MV staleness in feed health header
    loadMVStalenessIndicator().catch(function(e) { console.warn('[Admin] MV staleness check failed:', e.message); if (typeof reportError === 'function') reportError('admin-mv-staleness', e); });
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] loadBoardHealth error:', err); toastError('Failed to load board health');
  }
}

// ─── Export Boards CSV ───
async function exportBoardsCsv(type) {
  var btn = document.getElementById('export-' + type + '-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Exporting…'; }
  try {
    var sb = window._bjSupa;
    if (!sb) throw new Error('Supabase not ready');

    var query = sb.from('ats_companies').select('slug,source,company_name,job_count,last_http_status,last_checked,last_refresh_at,created_at');

    if (type === 'dead') {
      query = query.eq('last_http_status', 404);
    } else if (type === 'unscraped') {
      query = query.is('last_refresh_at', null);
    } else if (type === 'active') {
      query = query.gt('job_count', 0);
    }
    // 'all' = no extra filter

    query = query.eq('is_active', true).order('source').order('slug');

    var allRows = [];
    var pageSize = 1000;
    var page = 0;
    while (true) {
      var { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows = allRows.concat(data);
      if (data.length < pageSize) break;
      page++;
      if (page > 100) break; // safety
    }

    if (allRows.length === 0) {
      if (typeof showToast === 'function') showToast('No boards found for "' + type + '"', { type: 'warn' });
      return;
    }

    // Build CSV
    var headers = ['slug','source','company_name','job_count','last_http_status','last_checked','last_refresh_at','created_at'];
    var csvLines = [headers.join(',')];
    allRows.forEach(function(r) {
      csvLines.push(headers.map(function(h) {
        var v = r[h];
        if (v == null) return '';
        v = String(v);
        if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0) {
          return '"' + v.replace(/"/g, '""') + '"';
        }
        return v;
      }).join(','));
    });

    var blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = 'boards-' + type + '-' + dateStr + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showToast === 'function') showToast('Exported ' + allRows.length.toLocaleString() + ' ' + type + ' boards', { type: 'success' });
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] Export error:', err); toastError('Export failed');
    if (typeof showToast === 'function') showToast('Export failed: ' + err.message, { type: 'error' });
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Export ' + type.charAt(0).toUpperCase() + type.slice(1) + ' Boards'; }
  }
}

// ─── Feed Health Charts (stacked area by platform) ───
var _fhCharts = {};
var _platformColors = {
  greenhouse: '#5b8a72',
  lever: '#6b82a8',
  ashby: '#a08858',
  workable: '#8878a0',
  recruitee: '#a07080'
};
var _platformLineColors = {
  greenhouse: '#2d6b4a',
  lever: '#3b5a8a',
  ashby: '#7a6530',
  workable: '#5e4880',
  recruitee: '#804050'
};

async function loadFeedHealthCharts() {
  if (typeof echarts === 'undefined') return;
  try {
    var res = await sb.rpc('get_feed_health_history', { days_back: 90 });
    if (res.error || !res.data || !res.data.length) return;
    var rows = res.data;

    // Build date axis + per-platform series
    var dates = [];
    var dateSet = {};
    var platforms = [];
    var platSet = {};
    rows.forEach(function(r) {
      if (!dateSet[r.snapshot_date]) { dateSet[r.snapshot_date] = true; dates.push(r.snapshot_date); }
      if (!platSet[r.platform]) { platSet[r.platform] = true; platforms.push(r.platform); }
    });
    dates.sort();

    // Build lookup: data[platform][date] = row
    var lookup = {};
    rows.forEach(function(r) {
      if (!lookup[r.platform]) lookup[r.platform] = {};
      lookup[r.platform][r.snapshot_date] = r;
    });

    var t = seoChartTheme();
    var legend = { data: platforms.map(function(p) { return p.charAt(0).toUpperCase() + p.slice(1); }), textStyle: { color: '#7b829a', fontSize: 11 }, top: 4, right: 10 };
    var grid = { top: 40, right: 20, bottom: 30, left: 60 };
    var xAxis = { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35, interval: Math.max(0, Math.floor(dates.length / 10) - 1) } };

    function makeSeries(field) {
      return platforms.map(function(p) {
        return {
          name: p.charAt(0).toUpperCase() + p.slice(1),
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.15 },
          lineStyle: { width: 2, color: _platformLineColors[p] || _platformColors[p] || '#666' },
          symbol: 'none',
          itemStyle: { color: _platformColors[p] || '#999' },
          data: dates.map(function(d) { return lookup[p] && lookup[p][d] ? lookup[p][d][field] : 0; })
        };
      });
    }

    // Chart 1: Total Boards
    var el1 = document.getElementById('fh-chart-total-boards');
    if (el1) {
      if (_fhCharts.totalBoards) _fhCharts.totalBoards.dispose();
      _fhCharts.totalBoards = echarts.init(el1);
      _fhCharts.totalBoards.setOption(Object.assign({}, t, {
        title: { text: 'Total Boards by Platform', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('total_boards')
      }), true);
    }

    // Chart 2: Active Boards
    var el2 = document.getElementById('fh-chart-active-boards');
    if (el2) {
      if (_fhCharts.activeBoards) _fhCharts.activeBoards.dispose();
      _fhCharts.activeBoards = echarts.init(el2);
      _fhCharts.activeBoards.setOption(Object.assign({}, t, {
        title: { text: 'Active Boards by Platform (with jobs)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('active_boards')
      }), true);
    }

    // Chart 3: Jobs
    var el3 = document.getElementById('fh-chart-jobs');
    if (el3) {
      if (_fhCharts.jobs) _fhCharts.jobs.dispose();
      _fhCharts.jobs = echarts.init(el3);
      _fhCharts.jobs.setOption(Object.assign({}, t, {
        title: { text: 'Jobs by Platform', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        legend: legend, grid: grid, xAxis: xAxis,
        yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: makeSeries('total_jobs')
      }), true);
    }

    window.addEventListener('resize', function() {
      Object.keys(_fhCharts).forEach(function(k) { if (_fhCharts[k]) _fhCharts[k].resize(); });
    });
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] Feed health charts error:', err); toastWarning('Feed health charts failed to load');
  }
}

// ─── Discovery Pipeline Stats (Item #3) ───
async function loadDiscoveryPipelineStats() {
  try {
    // Companies with discovery_status
    var { data: discovered, count: discoveredCount } = await sb
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('discovery_status', 'found');
    setAdminText('dp-companies', fmtAdminNum(discoveredCount || 0));

    var { count: noneCount } = await sb
      .from('companies')
      .select('*', { count: 'exact', head: true })
      .eq('discovery_status', 'none');
    setAdminText('dp-boards-none', fmtAdminNum(noneCount || 0));

    // Boards found by source
    var { data: boardsBySource } = await sb
      .from('ats_companies')
      .select('source')
      .not('source', 'is', null);

    if (boardsBySource) {
      var sourceCounts = {};
      var totalBoardsFound = 0;
      boardsBySource.forEach(function(b) {
        var src = b.source || 'unknown';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
        totalBoardsFound++;
      });
      setAdminText('dp-boards-found', fmtAdminNum(totalBoardsFound));

      var tbody = document.getElementById('dp-source-body');
      if (tbody) {
        tbody.innerHTML = Object.entries(sourceCounts)
          .sort(function(a, b) { return b[1] - a[1]; })
          .map(function(entry) {
            return '<tr><td>' + escapeHtml(entry[0]) + '</td><td style="text-align:right">' + fmtAdminNum(entry[1]) + '</td><td style="text-align:right">—</td><td style="text-align:right">—</td></tr>';
          }).join('');
      }
    }

    // Extension installs (profiles with extension_version set)
    var { count: extCount } = await sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('extension_version', 'is', null);
    setAdminText('dp-ext-installs', fmtAdminNum(extCount || 0));

    // Connections scanned
    var { count: connCount } = await sb
      .from('connections')
      .select('*', { count: 'exact', head: true });
    setAdminText('dp-connections', fmtAdminNum(connCount || 0));

    // Board Discovery Queue stats
    var { count: queuePending } = await sb
      .from('board_discovery_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    setAdminText('dp-queue-pending', fmtAdminNum(queuePending || 0));

    var { count: queueFound } = await sb
      .from('board_discovery_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'found');
    setAdminText('dp-queue-found', fmtAdminNum(queueFound || 0));

    var { count: queueTotal } = await sb
      .from('board_discovery_queue')
      .select('*', { count: 'exact', head: true });
    setAdminText('dp-queue-total', fmtAdminNum(queueTotal || 0));

  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] Discovery pipeline stats error:', err);
  }
}

// ─── Auto-Apply Engine Stats (Item #1) ───
async function loadAutoApplyStats() {
  try {
    // Get latest trigger run from audit_log
    var { data: lastRun } = await sb
      .from('audit_log')
      .select('details, created_at')
      .eq('action', 'auto_apply_trigger')
      .order('created_at', { ascending: false })
      .limit(1);

    if (lastRun && lastRun.length > 0) {
      var details = typeof lastRun[0].details === 'string' ? JSON.parse(lastRun[0].details) : lastRun[0].details;
      setAdminText('aa-eligible', fmtAdminNum(details.eligible_users || 0));
      setAdminText('aa-matched', fmtAdminNum(details.matches_found || 0));
      setAdminText('aa-scored', fmtAdminNum(details.scored || 0));
      setAdminText('aa-queued', fmtAdminNum(details.queued || 0));

      var ago = Math.round((Date.now() - new Date(lastRun[0].created_at).getTime()) / 60000);
      setAdminText('aa-last-run', ago < 60 ? ago + 'm ago' : Math.round(ago / 60) + 'h ago');
    } else {
      setAdminText('aa-last-run', 'Never');
    }

    // Also show total pending applications
    var { count: pendingCount } = await sb
      .from('pending_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingCount != null) {
      var queuedEl = document.getElementById('aa-queued');
      if (queuedEl) queuedEl.title = pendingCount + ' total pending';
    }
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] Auto-apply stats error:', err);
  }
}

// ─── Refresh Cycle Status (Tiered) ───
async function loadRefreshCycle() {
  try {
    var res = await sb.rpc('get_refresh_cycle_status');
    if (res.error) { console.error('[Admin] Cycle RPC error:', res.error); toastWarning('Refresh cycle data unavailable'); return; }
    var c = res.data;
    if (!c) return;

    // HOT tier progress (primary metric)
    var hotPct = c.hot_pct || 0;
    setAdminText('ac-cycle-pct', hotPct + '%');
    var bar = document.getElementById('ac-cycle-bar');
    if (bar) setTimeout(function() { bar.style.width = hotPct + '%'; }, 100);

    setAdminText('ac-cycle-total', fmtAdminNum(c.total_boards));
    setAdminText('ac-cycle-refreshed', fmtAdminNum(c.hot_fresh || 0) + ' / ' + fmtAdminNum(c.hot_total || 0) + ' HOT');
    setAdminText('ac-cycle-pending', fmtAdminNum(c.hot_due || 0) + ' HOT due');

    // Rate with trend arrow: compare 1h vs 6h average
    var rate1h = c.rate_1h || 0;
    var rate6h = c.rate_6h || 0;
    var rateStr = fmtAdminNum(rate1h) + '/hr';
    if (rate6h > 0 && rate1h > 0) {
      var pctChange = Math.round(((rate1h - rate6h) / rate6h) * 100);
      if (pctChange > 10) {
        rateStr += ' <span style="color:#4a9a6b;font-size:0.8em">▲ ' + pctChange + '%</span>';
      } else if (pctChange < -10) {
        rateStr += ' <span style="color:#c06060;font-size:0.8em">▼ ' + Math.abs(pctChange) + '%</span>';
      } else {
        rateStr += ' <span style="color:#8b929e;font-size:0.8em">● steady</span>';
      }
    }
    var rateEl = document.getElementById('ac-cycle-rate');
    if (rateEl) rateEl.innerHTML = rateStr;

    // ETA based on HOT cycle
    var estHours = c.est_hot_cycle_hours || 0;
    if (estHours <= 0) {
      setAdminText('ac-cycle-eta', 'Up to date');
    } else if (estHours < 1) {
      setAdminText('ac-cycle-eta', Math.round(estHours * 60) + 'min cycle');
    } else {
      setAdminText('ac-cycle-eta', estHours.toFixed(1) + 'h cycle');
    }

    // Last refresh
    if (c.last_refresh) {
      var lr = new Date(c.last_refresh);
      var minsAgo = Math.round((Date.now() - lr.getTime()) / 60000);
      setAdminText('ac-cycle-start', minsAgo < 60 ? minsAgo + 'min ago' : Math.round(minsAgo / 60) + 'h ago');
    }

    // Sparkline: hourly throughput (last 24h)
    var sparkEl = document.getElementById('ac-cycle-spark');
    if (sparkEl && c.hourly_rates && c.hourly_rates.length > 1 && typeof echarts !== 'undefined') {
      var hours = c.hourly_rates.map(function(r) { return new Date(r.hour).getHours() + ':00'; });
      var counts = c.hourly_rates.map(function(r) { return r.count; });
      var chart = echarts.init(sparkEl);
      chart.setOption({
        grid: { top: 4, right: 4, bottom: 16, left: 30 },
        xAxis: { type: 'category', data: hours, axisLabel: { fontSize: 9, color: '#94a3b8' }, axisLine: { show: false }, axisTick: { show: false } },
        yAxis: { type: 'value', axisLabel: { fontSize: 9, color: '#94a3b8' }, splitLine: { lineStyle: { color: '#1e293b' } } },
        series: [{ type: 'bar', data: counts, itemStyle: { color: '#6b82a8', borderRadius: [2, 2, 0, 0] }, barMaxWidth: 16 }],
        tooltip: { trigger: 'axis', formatter: function(p) { return p[0].name + ': ' + p[0].value.toLocaleString() + ' boards'; } }
      });
    }
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] loadRefreshCycle error:', err); toastWarning('Refresh cycle data failed to load');
  }
}

// A15 S5: MV staleness indicator in feed health header
async function loadMVStalenessIndicator() {
  var result = await sb.from('mv_landing_stats').select('refreshed_at').single();
  if (!result || !result.data) return;
  var refreshedAt = new Date(result.data.refreshed_at);
  var minsAgo = Math.round((Date.now() - refreshedAt.getTime()) / 60000);
  var fresh = minsAgo <= 15;
  var ageStr = minsAgo < 60 ? minsAgo + 'min ago' : Math.round(minsAgo / 60) + 'h ' + (minsAgo % 60) + 'min ago';
  var healthEl = document.getElementById('admin-health');
  if (healthEl) {
    var badge = document.getElementById('admin-mv-stale');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'admin-mv-stale';
      badge.style.cssText = 'margin-left:12px;font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:4px;border:1px solid var(--border);';
      healthEl.appendChild(badge);
    }
    badge.style.background = fresh ? 'var(--bg-input)' : 'rgba(245,158,11,0.1)';
    badge.style.color = fresh ? 'var(--text-faint)' : '#f59e0b';
    badge.textContent = 'MV: ' + ageStr + (fresh ? '' : ' ⚠ STALE');
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

var _allCohorts = [];
var _selectedCohortIds = []; // empty = all selected

async function loadCohortTab() {
  console.log('[Admin] loadCohortTab');
  try {
    var res = await sb.rpc('get_cohort_overview');
    if (res.error) { console.error('[Admin] Cohort RPC error:', res.error); toastWarning('Cohort data unavailable'); return; }
    var cohorts = res.data;
    if (!cohorts || !cohorts.length) {
      setAdminText('ac-total-cohorts', '0');
      setAdminText('ac-total-users', '0');
      setAdminText('ac-pro-pct', '—');
      setAdminText('ac-active-7d', '0');
      setAdminText('ac-churned', '0');
      return;
    }

    _allCohorts = cohorts;
    window._cohortList = cohorts;

    // Build cohort filter chips
    renderCohortData(cohorts);
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] loadCohortTab error:', err); toastError('Failed to load cohort data');
  }
}

function toggleCohortFilter(id) {
  // Driven by table checkboxes now
  _selectedCohortIds = [];
  document.querySelectorAll('.cohort-row-cb:checked').forEach(function(cb) {
    _selectedCohortIds.push(cb.dataset.cohortId);
  });
  var selectAll = document.getElementById('cohort-select-all');
  if (selectAll) {
    var total = document.querySelectorAll('.cohort-row-cb').length;
    selectAll.checked = _selectedCohortIds.length === total;
    selectAll.indeterminate = _selectedCohortIds.length > 0 && _selectedCohortIds.length < total;
  }
  var filtered = _selectedCohortIds.length === 0 ? _allCohorts : _allCohorts.filter(function(c) {
    return _selectedCohortIds.indexOf(c.id) >= 0;
  });
  renderCohortData(filtered);
}
window.updateCohortCharts = function() { toggleCohortFilter(); };

function renderCohortData(cohorts) {
    var totalUsers = cohorts.reduce(function(s, c) { return s + (c.user_count || 0); }, 0);
    var totalPro = cohorts.reduce(function(s, c) { return s + (c.pro_count || 0); }, 0);
    var active7d = cohorts.reduce(function(s, c) { return s + (c.active_7d || 0); }, 0);
    var churned28d = cohorts.reduce(function(s, c) { return s + (c.churned_28d || 0); }, 0);

    setAdminText('ac-total-cohorts', cohorts.length);
    setAdminText('ac-total-users', fmtAdminNum(totalUsers));
    setAdminText('ac-pro-pct', fmtAdminPct(totalPro, totalUsers));
    setAdminText('ac-active-7d', fmtAdminNum(active7d));
    setAdminText('ac-churned', fmtAdminNum(churned28d));

    var tbody = document.getElementById('admin-cohort-body');
    if (!tbody) return;

    // Collect all plan types across all cohorts
    var allPlans = {};
    cohorts.forEach(function(c) {
      if (c.plan_breakdown) c.plan_breakdown.forEach(function(pb) { allPlans[pb.plan] = true; });
    });
    var planOrder = ['free', 'starter', 'pro', 'enterprise'].filter(function(p) { return allPlans[p]; });

    // Build dynamic header
    var thead = tbody.parentElement.querySelector('thead');
    if (thead) {
      thead.innerHTML = '<tr>' +
        '<th style="width:32px;"><input type="checkbox" id="cohort-select-all" title="Select all" style="cursor:pointer;" onchange="updateCohortCharts()"></th>' +
        '<th>ID</th><th>Age</th><th>Enrollment</th><th>Users</th><th>Active 7d</th><th>Churned</th>' +
        planOrder.map(function(p) { return '<th>' + p.charAt(0).toUpperCase() + p.slice(1) + '</th>'; }).join('') +
        '<th>Revenue/mo</th><th>LTV</th><th>ARPU</th>' +
        '</tr>';
    }

    tbody.innerHTML = cohorts.map(function(c) {
      var enrollStart = c.enrollment_start ? new Date(c.enrollment_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      var enrollClose = c.enrollment_close ? new Date(c.enrollment_close).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Open';
      var isOpen = !c.enrollment_close || new Date(c.enrollment_close) > new Date();

      // Build plan count lookup
      var planCounts = {};
      if (c.plan_breakdown) c.plan_breakdown.forEach(function(pb) { planCounts[pb.plan] = pb.count; });

      return '<tr>' +
        '<td><input type="checkbox" class="cohort-row-cb" data-cohort-id="' + c.id + '" onchange="toggleCohortFilter()" style="cursor:pointer;"></td>' +
        '<td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + (c.display_id || c.id) + '</td>' +
        '<td>' + (c.age_days || 0) + 'd</td>' +
        '<td style="font-size:12px">' + enrollStart + ' — ' + enrollClose + (isOpen ? ' <span class="admin-green">●</span>' : '') + '</td>' +
        '<td>' + fmtAdminNum(c.user_count) + '</td>' +
        '<td>' + fmtAdminNum(c.active_7d) + '</td>' +
        '<td class="' + (c.churned_28d > 0 ? 'admin-red' : '') + '">' + fmtAdminNum(c.churned_28d) + '</td>' +
        planOrder.map(function(p) {
          var cnt = planCounts[p] || 0;
          var cls = p === 'pro' ? 'admin-green' : (p === 'enterprise' ? 'admin-amber' : '');
          return '<td class="' + cls + '">' + fmtAdminNum(cnt) + '</td>';
        }).join('') +
        '<td style="color:var(--text-faint)">—</td>' +
        '<td style="color:var(--text-faint)">—</td>' +
        '<td style="color:var(--text-faint)">—</td>' +
        '</tr>';
    }).join('');

    renderCohortCharts(cohorts);
}

// ─── Entitlements Tab ───
async function loadEntitlementsTab() {
  console.log('[Admin] loadEntitlementsTab');
  var select = document.getElementById('entitlement-cohort-select');
  var tbody = document.getElementById('admin-entitlement-body');
  if (!select || !tbody) return;

  // Populate dropdown if empty
  if (select.options.length === 0) {
    try {
      var res = await sb.from('cohorts').select('id,display_id,name').eq('is_active', true).order('created_at');
      if (res.data) {
        res.data.forEach(function(c) {
          var opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = (c.display_id || c.id) + ' — ' + c.name;
          select.appendChild(opt);
        });
      }
    } catch (e) { console.warn('[Admin] Cohort list load error:', e); if (typeof reportError === 'function') reportError('admin-cohort', e); }
    select.addEventListener('change', function() { loadEntitlementRows(select.value); });
  }

  if (select.value) loadEntitlementRows(select.value);
}

async function loadEntitlementRows(cohortId) {
  var tbody = document.getElementById('admin-entitlement-body');
  if (!tbody || !cohortId) return;
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-faint)">Loading...</td></tr>';

  var res = await sb.from('cohort_plan_entitlements')
    .select('feature_id,plan_id,behavior,limit_value')
    .eq('cohort_id', cohortId)
    .order('feature_id')
    .order('plan_id');

  if (res.error || !res.data) {
    tbody.innerHTML = '<tr><td colspan="5" class="admin-red">Error loading entitlements</td></tr>';
    return;
  }

  // Group by feature for a cleaner view
  tbody.innerHTML = res.data.map(function(e) {
    var limitStr = e.limit_value === -1 ? '∞' : String(e.limit_value);
    var behaviorColor = e.behavior === 'off' ? 'admin-red' : (e.behavior === 'unlimited' ? 'admin-green' : '');
    return '<tr>' +
      '<td>' + e.feature_id + '</td>' +
      '<td>' + e.plan_id + '</td>' +
      '<td class="' + behaviorColor + '">' + e.behavior + '</td>' +
      '<td style="font-family:var(--mono)">' + limitStr + '</td>' +
      '<td>—</td>' +
      '</tr>';
  }).join('');
}

// ─── Cohort Charts ───
function renderCohortCharts(cohorts) {
  // 1. Sessions over time (adjusted to cohort open date)
  renderCohortSessionsChart();

  // 2. Cumulative Revenue (placeholder until Stripe data)
  renderCohortRevenueChart();

  // 3. Plan Distribution — stacked bar (Free/Pro per cohort)
  var planEl = document.getElementById('admin-cohort-plan-chart');
  if (planEl && typeof echarts !== 'undefined') {
    var planChart = echarts.init(planEl);
    var names = cohorts.map(function(c) { return c.display_id || c.name; });
    var t = seoChartTheme();
    planChart.setOption(Object.assign({}, t, {
      title: { text: 'Plan Distribution', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      legend: { data: ['Free', 'Pro'], textStyle: { color: '#7b829a', fontSize: 11 }, top: 4, right: 10 },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: names, axisLabel: { color: '#7b829a', fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [
        { name: 'Free', type: 'bar', stack: 'plan', data: cohorts.map(function(c) { return c.free_count || 0; }), itemStyle: { color: '#8b929e' } },
        { name: 'Pro', type: 'bar', stack: 'plan', data: cohorts.map(function(c) { return c.pro_count || 0; }), itemStyle: { color: '#6b82a8' } }
      ]
    }), true);
    window.addEventListener('resize', function() { planChart.resize(); });
  }

  // 4. User Growth — cumulative signups
  renderCohortGrowthChart();
}

async function renderCohortRevenueChart() {
  var el = document.getElementById('admin-cohort-revenue-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  // Placeholder until Stripe revenue data is wired
  chart.setOption({
    title: { text: 'Cumulative Revenue / Month', subtext: 'Waiting for Stripe integration', left: 'center', top: 'center', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, subtextStyle: { color: '#9ca3af', fontSize: 11 } }
  });
  window.addEventListener('resize', function() { chart.resize(); });
}

async function renderCohortGrowthChart() {
  var el = document.getElementById('admin-cohort-growth-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  try {
    var res = await sb.from('profiles').select('created_at').order('created_at', { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      chart.setOption({ title: { text: 'User Growth', subtext: 'No signup data yet', left: 'center', top: 'center', textStyle: { color: '#d1d5db', fontSize: 13 } } });
      return;
    }
    var weekMap = {};
    res.data.forEach(function(p) {
      var d = new Date(p.created_at);
      var wk = d.toISOString().slice(0, 10);
      weekMap[wk] = (weekMap[wk] || 0) + 1;
    });
    var dates = Object.keys(weekMap).sort();
    var cumulative = [], sum = 0;
    dates.forEach(function(d) { sum += weekMap[d]; cumulative.push(sum); });
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'User Growth', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [{ type: 'line', data: cumulative, smooth: true, lineStyle: { color: '#6b82a8', width: 2 }, itemStyle: { color: '#6b82a8' }, areaStyle: { color: 'rgba(107,130,168,0.06)' }, symbol: 'circle', symbolSize: 4 }]
    }), true);
    window.addEventListener('resize', function() { chart.resize(); });
  } catch (e) { console.error('[Admin] Growth chart error:', e); if (typeof reportError === 'function') reportError('admin-growth-chart', e); toastWarning('Growth chart failed to render'); }
}

async function renderCohortSessionsChart() {
  var el = document.getElementById('admin-cohort-sessions-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);
  try {
    var since = new Date(Date.now() - 30 * 86400000).toISOString();
    var res = await sb.from('user_sessions').select('started_at').gte('started_at', since).order('started_at', { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      chart.setOption({ title: { text: 'Sessions / Day', subtext: 'Sessions will appear after launch', left: 'center', top: 'center', textStyle: { color: '#d1d5db', fontSize: 13 } } });
      return;
    }
    var dayMap = {};
    res.data.forEach(function(s) {
      var d = new Date(s.started_at).toISOString().slice(0, 10);
      dayMap[d] = (dayMap[d] || 0) + 1;
    });
    var dates = Object.keys(dayMap).sort();
    var counts = dates.map(function(d) { return dayMap[d]; });
    var t = seoChartTheme();
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Sessions / Day (30d)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
      grid: { top: 35, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 11 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [{ type: 'bar', data: counts, itemStyle: { color: '#5b8a72', borderRadius: [3,3,0,0] } }]
    }), true);
    window.addEventListener('resize', function() { chart.resize(); });
  } catch (e) { console.error('[Admin] Sessions chart error:', e); if (typeof reportError === 'function') reportError('admin-sessions-chart', e); toastWarning('Sessions chart failed to render'); }
}

// ═══════════════════════════════════════════════════════════
// TAB 3 (was 4): USERS + SESSIONS
// ═══════════════════════════════════════════════════════════

async function loadUsersTab() {
  console.log('[Admin] loadUsersTab');
  try {
    var res = await sb.rpc('get_user_overview');
    if (res.error) { console.error('[Admin] Users RPC error:', res.error); toastWarning('Users data unavailable'); return; }
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
          series: [{ type: 'bar', data: d.signup_by_week.map(function(w) { return w.count; }), itemStyle: { borderRadius: [4, 4, 0, 0], color: '#6b82a8' }, barWidth: '60%' }]
        });
        window.addEventListener('resize', function() { chart.resize(); });
      }
    }
  } catch (err) {
    reportError('admin', err);
    console.error('[Admin] loadUsersTab error:', err); toastError('Failed to load users data');
  }
}

// CS-P1-004 FE-005: Register admin exports with BJ namespace
(function() {
  ['_cohortList','_logAdminAction','updateCohortCharts'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin', registered: Date.now() };
    }
  });
})();
