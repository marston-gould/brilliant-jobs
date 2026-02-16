console.log('[BJ] Dashboard v2.62 loaded');
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
let currentUser = null;

// Auth
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) { window.location.href = '/'; return; }
  currentUser = session.user;
  try {
    const { data: profile } = await sb.from('profiles').select('approved').eq('id', currentUser.id).single();
    if (!profile?.approved) { window.location.href = '/?pending=1'; return; }
  } catch (e) {}
  $('#auth-gate').style.display = 'none';
  $('#app').style.display = 'flex';
  $('#nav-email').textContent = currentUser.email;
  $('#nav-avatar').textContent = currentUser.email.charAt(0).toUpperCase();
  // Trigger sparkle flourish
  setTimeout(() => { $('#nav-brand').classList.add('sparkle-active'); }, 100);
  loadStats();
  checkExtensionStatus();
  loadCollections();
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
// SHARED STATE — declared early so all modules can access
// ============================================================
// Tuning state (refined by tuning.js when it loads)
var tuningSettings = JSON.parse(localStorage.getItem('bj_tuning') || '{}');
var tuningLocExclPills = tuningSettings.locationExcludes || [];
var tuningTitleExclPills = tuningSettings.titleExcludes || [];
var tuningCoExclPills = tuningSettings.companyExcludes || [];
var tuningIndExclPills = tuningSettings.industryExcludes || [];
var levelHierarchy = tuningSettings.levelHierarchy || [];
// Stub — overridden by tuning.js with full implementation
var getJobLevel = function(title, hierarchy) { return null; };

// Pill arrays (used by query-builder.js, location.js, browsers.js)
var whatPills = [];
var wherePills = [];
var whenPills = [];
var whoPills = [];
var payPills = [];
var whatNotPills = [];
var whereNotPills = [];
var whoNotPills = [];
var savedFilters = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
var WORKPLACE_WORDS = ['remote','hybrid','onsite','on-site','in-office'];
var SALARY_RE = /^\$?\d{2,3}k?\+?$/i;
var DEFAULT_RADIUS = 30;

// Job feed state (used by job-feed.js, keywords.js, pipeline.js)
var searchTimeout = null;
var currentJobPage = 0;
var JOBS_PER_PAGE = 50;
var allJobs = [];
var currentJobs = [];
var jobSortStack = [{ field: 'updated_at', asc: false }];
var hiddenJobIds = JSON.parse(localStorage.getItem('bj_hidden_jobs') || '[]');
var savedJobIds = JSON.parse(localStorage.getItem('bj_saved_jobs') || '[]');
var appliedJobIds = JSON.parse(localStorage.getItem('bj_applied_jobs') || '[]');

// Resume state (populated fully in resumes.js)
var resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');

// Shared filter color palette (10 colors for numbered filter badges)
var filterColors = ['#6366f1','#f59e0b','#ec4899','#22c55e','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6','#a855f7'];

