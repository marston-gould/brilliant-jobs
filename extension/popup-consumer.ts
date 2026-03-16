// popup-consumer.ts — EXT-AS-2: Consumer Popup UI + Mode Persistence
// Manages the Application Mode consumer view, threshold slider,
// pipeline summary, activity feed, and admin legacy toggle.

// ============================================================
// CONSTANTS
// ============================================================

const MODES_USING_SCORING = ['score-gated', 'auto-score-gate', 'auto-rewrite', 'full-autopilot'];

interface ActivityItem {
  id: string;
  client_id: string; // AF-006: unique dedup key for Supabase sync
  type: 'saved' | 'applied' | 'rewrite-offered' | 'rewrite-submitted' | 'auto-submitted';
  jobTitle: string;
  company: string;
  score?: number;
  threshold?: number;
  timestamp: string; // ISO
  synced?: boolean;  // AF-006: true once synced to user_activity_log
}

// ============================================================
// VIEW SWITCHING: Consumer vs Legacy
// ============================================================

/**
 * Initialize the consumer popup system. Called from popup.ts showApp().
 * - Non-admin users: always show consumer view.
 * - Admin/superadmin users: show based on adminLegacyMode toggle.
 */
async function initConsumerPopup(role: string): Promise<void> {
  const isAdmin = role === 'admin' || role === 'superadmin';
  const legacyToggleWrap = document.getElementById('legacy-toggle-wrap');
  const legacyToggle = document.getElementById('legacy-toggle') as HTMLInputElement | null;

  if (isAdmin && legacyToggleWrap && legacyToggle) {
    legacyToggleWrap.style.display = 'flex';

    // Load persisted toggle state
    const stored = await chrome.storage.local.get('adminLegacyMode');
    const legacyOn = stored.adminLegacyMode !== undefined ? stored.adminLegacyMode : true; // default: legacy ON for admins
    legacyToggle.checked = legacyOn;

    // Wire toggle
    legacyToggle.addEventListener('change', async () => {
      const isLegacy = legacyToggle.checked;
      await chrome.storage.local.set({ adminLegacyMode: isLegacy });
      _switchView(isLegacy);
      try { phCapture('admin_toggle', { to_view: isLegacy ? 'legacy' : 'consumer' }); } catch {}
    });

    _switchView(legacyOn);
  } else {
    // Non-admin: always consumer view
    _switchView(false);
  }

  // Initialize consumer view data
  await _initModeSelector();
  await _initThresholdSlider();
  await _loadPipelineSummary();
  await _loadActivityFeed();
  _loadResumeCard();

  // EXT-AS-8: Bottom nav routing + settings listeners
  _initBottomNav();
  _initSettingsListeners();

  // EXT-BUILD-001 S2.4: Update banner
  _initUpdateBanner();
}

function _switchView(showLegacy: boolean): void {
  const consumerView = document.getElementById('consumer-view');
  const legacyView = document.getElementById('admin-legacy-view');

  if (consumerView) {
    consumerView.classList.toggle('active', !showLegacy);
  }
  if (legacyView) {
    legacyView.classList.toggle('active', showLegacy);
  }
}

// ============================================================
// MODE SELECTOR
// ============================================================

async function _initModeSelector(): Promise<void> {
  // Load persisted mode from chrome.storage (EXT-AS-1 syncs from Supabase)
  const stored = await chrome.storage.local.get('applySettings');
  const currentMode = stored.applySettings?.applicationMode || 'score-gated';

  _selectModeCard(currentMode);
  _updateThresholdVisibility(currentMode);

  // Wire click handlers
  const modeCards = document.querySelectorAll('#cv-mode-list .cv-mode-card');
  modeCards.forEach((card: Element) => {
    card.addEventListener('click', async () => {
      const mode = (card as HTMLElement).dataset.mode;
      if (!mode) return;

      _selectModeCard(mode);
      _updateThresholdVisibility(mode);

      // Persist to chrome.storage.sync (roams across devices)
      await chrome.storage.sync.set({ applicationMode: mode });

      // Also update local applySettings for EXT-AS-1 sync consistency
      const current = await chrome.storage.local.get('applySettings');
      const settings = current.applySettings || {};
      settings.applicationMode = mode;
      await chrome.storage.local.set({ applySettings: settings });

      // Notify background to sync back to Supabase
      try {
        chrome.runtime.sendMessage({ type: 'syncApplySettingsToSupabase', settings });
      } catch {}

      try { phCapture('application_mode_changed', { mode }); } catch {}
    });
  });
}

function _selectModeCard(mode: string): void {
  const cards = document.querySelectorAll('#cv-mode-list .cv-mode-card');
  cards.forEach((card: Element) => {
    const el = card as HTMLElement;
    el.classList.toggle('selected', el.dataset.mode === mode);
  });
}

function _updateThresholdVisibility(mode: string): void {
  const section = document.getElementById('cv-threshold-section');
  if (section) {
    section.style.display = MODES_USING_SCORING.includes(mode) ? '' : 'none';
  }
}

// ============================================================
// THRESHOLD SLIDER
// ============================================================

async function _initThresholdSlider(): Promise<void> {
  const slider = document.getElementById('cv-threshold-slider') as HTMLInputElement | null;
  const valueDisplay = document.getElementById('cv-threshold-value');
  if (!slider || !valueDisplay) return;

  // Load persisted threshold
  const stored = await chrome.storage.local.get('applySettings');
  const threshold = stored.applySettings?.scoreThreshold || 75;
  slider.value = String(threshold);
  valueDisplay.textContent = String(threshold);

  // Debounce persistence
  let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

  slider.addEventListener('input', () => {
    const val = slider.value;
    valueDisplay.textContent = val;

    // Debounce the storage write
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(async () => {
      const numVal = parseInt(val, 10);

      // Persist to chrome.storage.sync
      await chrome.storage.sync.set({ scoreThreshold: numVal });

      // Update local applySettings
      const current = await chrome.storage.local.get('applySettings');
      const settings = current.applySettings || {};
      settings.scoreThreshold = numVal;
      await chrome.storage.local.set({ applySettings: settings });

      // Notify background
      try {
        chrome.runtime.sendMessage({ type: 'syncApplySettingsToSupabase', settings });
      } catch {}

      try { phCapture('threshold_changed', { threshold: numVal }); } catch {}
    }, 500);
  });
}

// ============================================================
// ACTIVE RESUME CARD
// ============================================================

async function _loadResumeCard(): Promise<void> {
  const nameEl = document.getElementById('cv-resume-name');
  const metaEl = document.getElementById('cv-resume-meta');
  if (!nameEl || !metaEl) return;

  try {
    const stored = await chrome.storage.local.get(['applySettings', 'applicantProfile']);
    const resumeId = stored.applySettings?.activeResumeId;

    if (resumeId) {
      // Try to get resume name from Supabase
      try {
        const resumes = await supabase.select('resumes', `id=eq.${resumeId}&select=display_name,updated_at&limit=1`);
        if (resumes && resumes.length > 0) {
          nameEl.textContent = escHtml(resumes[0].display_name || 'Resume');
          const updatedAt = resumes[0].updated_at ? _relativeTime(resumes[0].updated_at) : '';
          metaEl.textContent = updatedAt ? `Updated ${updatedAt}` : 'Active resume';
          return;
        }
      } catch {}
      nameEl.textContent = 'Resume selected';
      metaEl.textContent = 'Active on dashboard';
    } else {
      nameEl.textContent = 'No resume selected';
      metaEl.textContent = 'Select a resume on the dashboard';
    }
  } catch {
    nameEl.textContent = 'No resume selected';
    metaEl.textContent = 'Select a resume on the dashboard';
  }
}

// ============================================================
// PIPELINE SUMMARY
// ============================================================

async function _loadPipelineSummary(): Promise<void> {
  const savedEl = document.getElementById('cv-pipe-saved');
  const appliedEl = document.getElementById('cv-pipe-applied');
  const interviewEl = document.getElementById('cv-pipe-interview');
  const offerEl = document.getElementById('cv-pipe-offer');
  if (!savedEl || !appliedEl || !interviewEl || !offerEl) return;

  try {
    // Query pipeline counts from user_pipeline table
    const stages = ['saved', 'applied', 'interview', 'offer'];
    const pipeline = await supabase.select(
      'user_pipeline',
      'select=stage&limit=1000'
    );

    if (Array.isArray(pipeline)) {
      const counts: Record<string, number> = { saved: 0, applied: 0, interview: 0, offer: 0 };
      pipeline.forEach((row: { stage?: string }) => {
        const s = (row.stage || 'saved').toLowerCase();
        if (counts[s] !== undefined) counts[s]++;
      });
      savedEl.textContent = String(counts.saved);
      appliedEl.textContent = String(counts.applied);
      interviewEl.textContent = String(counts.interview);
      offerEl.textContent = String(counts.offer);
    }
  } catch {
    // Silently fail — show zeros
  }
}

// ============================================================
// ACTIVITY FEED
// ============================================================

async function _loadActivityFeed(): Promise<void> {
  const listEl = document.getElementById('cv-activity-list');
  if (!listEl) return;

  try {
    const stored = await chrome.storage.local.get('activityFeed');
    const feed: ActivityItem[] = stored.activityFeed || [];

    if (feed.length === 0) {
      listEl.innerHTML = '<div class="cv-activity-empty">No recent activity</div>';
      return;
    }

    // Show last 5, newest first
    const recent = feed.slice(-5).reverse();
    listEl.innerHTML = recent.map((item: ActivityItem) => {
      const dotColor = _activityDotColor(item.type);
      const label = _activityLabel(item.type);
      const detail = item.score !== undefined
        ? ` — score ${escHtml(String(item.score))}`
        : '';
      const time = _relativeTime(item.timestamp);
      return `<div class="cv-activity-item">
        <div class="cv-activity-dot ${dotColor}"></div>
        <div>
          <div class="cv-activity-text"><strong>${escHtml(label)}</strong> ${escHtml(item.jobTitle)} at ${escHtml(item.company)}${detail}</div>
          <div class="cv-activity-time">${escHtml(time)}</div>
        </div>
      </div>`;
    }).join('');
  } catch {
    listEl.innerHTML = '<div class="cv-activity-empty">No recent activity</div>';
  }
}

function _activityDotColor(type: string): string {
  switch (type) {
    case 'applied':
    case 'auto-submitted':
    case 'rewrite-submitted':
      return 'green';
    case 'rewrite-offered':
      return 'amber';
    case 'saved':
    default:
      return 'blue';
  }
}

function _activityLabel(type: string): string {
  switch (type) {
    case 'applied': return 'Applied';
    case 'auto-submitted': return 'Auto-applied';
    case 'rewrite-offered': return 'Rewrite offered';
    case 'rewrite-submitted': return 'Rewrite submitted';
    case 'saved': return 'Saved';
    default: return type;
  }
}

// ============================================================
// HELPERS
// ============================================================

function _relativeTime(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  } catch { return ''; }
}

/**
 * Add an activity item to the feed (called by other extension components).
 * Stored in chrome.storage.local, max 50 entries.
 */
async function addActivityItem(item: Omit<ActivityItem, 'id' | 'client_id'>): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('activityFeed');
    const feed: ActivityItem[] = stored.activityFeed || [];

    const newItem: ActivityItem = {
      ...item,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      client_id: 'af-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      synced: false,
    };

    feed.push(newItem);

    // Prune to max 50
    while (feed.length > 50) feed.shift();

    await chrome.storage.local.set({ activityFeed: feed });

    // AF-006: Fire-and-forget sync trigger to background.ts
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_ACTIVITY' });
    } catch {}

    // Refresh display if consumer view is active
    const consumerView = document.getElementById('consumer-view');
    if (consumerView?.classList.contains('active')) {
      await _loadActivityFeed();
    }
  } catch {}
}

// ============================================================
// SYNC LISTENER
// ============================================================

// Listen for chrome.storage changes to refresh UI when settings sync from dashboard
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.applySettings) {
      const newSettings = changes.applySettings.newValue;
      if (newSettings?.applicationMode) {
        _selectModeCard(newSettings.applicationMode);
        _updateThresholdVisibility(newSettings.applicationMode);
      }
      if (newSettings?.scoreThreshold !== undefined) {
        const slider = document.getElementById('cv-threshold-slider') as HTMLInputElement | null;
        const valueDisplay = document.getElementById('cv-threshold-value');
        if (slider) slider.value = String(newSettings.scoreThreshold);
        if (valueDisplay) valueDisplay.textContent = String(newSettings.scoreThreshold);
        // EXT-AS-8: Sync settings page threshold too
        const settingsSlider = document.getElementById('cv-settings-threshold-slider') as HTMLInputElement | null;
        const settingsValue = document.getElementById('cv-settings-threshold-value');
        if (settingsSlider) settingsSlider.value = String(newSettings.scoreThreshold);
        if (settingsValue) settingsValue.textContent = String(newSettings.scoreThreshold);
      }
      // EXT-AS-8: Sync daily limit
      if (newSettings?.dailyApplyLimit !== undefined) {
        const limitSlider = document.getElementById('cv-settings-limit-slider') as HTMLInputElement | null;
        const limitValue = document.getElementById('cv-settings-limit-value');
        if (limitSlider) limitSlider.value = String(newSettings.dailyApplyLimit);
        if (limitValue) limitValue.textContent = String(newSettings.dailyApplyLimit);
      }
    }
    if (changes.activityFeed) {
      _loadActivityFeed();
      _loadFullActivityFeed();
    }
    // EXT-AS-8: Sync rewrite preferences
    if (changes.rewritePreferences) {
      _loadRewritePreferences();
    }
  }
  if (area === 'sync') {
    if (changes.applicationMode) {
      _selectModeCard(changes.applicationMode.newValue);
      _updateThresholdVisibility(changes.applicationMode.newValue);
    }
    if (changes.scoreThreshold) {
      const slider = document.getElementById('cv-threshold-slider') as HTMLInputElement | null;
      const valueDisplay = document.getElementById('cv-threshold-value');
      if (slider) slider.value = String(changes.scoreThreshold.newValue);
      if (valueDisplay) valueDisplay.textContent = String(changes.scoreThreshold.newValue);
      const settingsSlider = document.getElementById('cv-settings-threshold-slider') as HTMLInputElement | null;
      const settingsValue = document.getElementById('cv-settings-threshold-value');
      if (settingsSlider) settingsSlider.value = String(changes.scoreThreshold.newValue);
      if (settingsValue) settingsValue.textContent = String(changes.scoreThreshold.newValue);
    }
  }
});

// ============================================================
// EXT-AS-8: BOTTOM NAV ROUTING
// ============================================================

const _NAV_PAGES = ['home', 'pipeline', 'settings', 'activity'] as const;

function _initBottomNav(): void {
  const navItems = document.querySelectorAll('.cv-nav-item[data-nav]');
  navItems.forEach(btn => {
    const nav = (btn as HTMLElement).getAttribute('data-nav');
    // EXT-BUILD-001 B1/B4: Resumes nav opens dashboard Resumes page via chrome.tabs.create
    // (inline onclick removed from HTML — CSP violation in MV3)
    if (nav === 'resumes') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        chrome.tabs.create({ url: 'https://brilliantjobs.app/#resumes' });
      });
      return;
    }
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (nav) _navigateToPage(nav);
    });
  });

  // Back buttons
  document.querySelectorAll('.cv-page-back[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = (btn as HTMLElement).getAttribute('data-back') || 'home';
      _navigateToPage(target);
    });
  });

  // "See all" activity link on home page
  const seeAllLink = document.getElementById('cv-activity-see-all');
  if (seeAllLink) {
    seeAllLink.addEventListener('click', (e) => {
      e.preventDefault();
      _navigateToPage('activity');
    });
  }
}

function _navigateToPage(page: string): void {
  // Hide all pages
  document.querySelectorAll('.cv-page').forEach(p => p.classList.remove('active'));

  // Show target page
  const target = document.getElementById(`cv-page-${page}`);
  if (target) target.classList.add('active');

  // Update nav highlight (activity doesn't have its own nav button — highlight home)
  document.querySelectorAll('.cv-nav-item').forEach(btn => {
    const nav = (btn as HTMLElement).getAttribute('data-nav');
    btn.classList.toggle('active', nav === (page === 'activity' ? 'home' : page));
  });

  // Load data for the page when navigated to
  if (page === 'pipeline') _loadPipelinePageData();
  if (page === 'settings') _loadSettingsPageData();
  if (page === 'activity') _loadFullActivityFeed();

  try { phCapture('popup_nav', { page }); } catch {}
}

// ============================================================
// EXT-AS-8: SETTINGS PAGE
// ============================================================

async function _loadSettingsPageData(): Promise<void> {
  await _loadRewritePreferences();
  await _loadDailyLimit();
  _loadSettingsThreshold();
  _loadSettingsResume();
  _loadSettingsEEOC();
}

async function _loadRewritePreferences(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('rewritePreferences');
    const prefs = stored.rewritePreferences || { preserveTone: true, addKeywords: true, keepOnePage: true, page_limit: 1 };

    const preserveTone = document.getElementById('cv-settings-preserve-tone') as HTMLInputElement | null;
    const addKeywords = document.getElementById('cv-settings-add-keywords') as HTMLInputElement | null;
    const pageLimit = document.getElementById('cv-settings-page-limit') as HTMLSelectElement | null;

    if (preserveTone) preserveTone.checked = prefs.preserveTone !== false;
    if (addKeywords) addKeywords.checked = prefs.addKeywords !== false;
    // B5: page_limit — migrate from boolean keepOnePage to numeric page_limit
    if (pageLimit) {
      const limit = prefs.page_limit || (prefs.keepOnePage === false ? 2 : 1);
      pageLimit.value = String(limit);
    }
  } catch {}
}

async function _saveRewritePreferences(): Promise<void> {
  const preserveTone = (document.getElementById('cv-settings-preserve-tone') as HTMLInputElement | null)?.checked ?? true;
  const addKeywords = (document.getElementById('cv-settings-add-keywords') as HTMLInputElement | null)?.checked ?? true;
  const pageLimitEl = document.getElementById('cv-settings-page-limit') as HTMLSelectElement | null;
  const page_limit = pageLimitEl ? parseInt(pageLimitEl.value, 10) || 1 : 1;

  // B5: Store both page_limit (new) and keepOnePage (backward compat)
  const prefs = { preserveTone, addKeywords, keepOnePage: page_limit === 1, page_limit };
  await chrome.storage.local.set({ rewritePreferences: prefs });

  // Sync to Supabase via background
  try { chrome.runtime.sendMessage({ type: 'syncApplySettingsToSupabase' }); } catch {}
  try { phCapture('rewrite_preferences_changed', prefs); } catch {}
}

async function _loadDailyLimit(): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('applySettings');
    const limit = stored.applySettings?.dailyApplyLimit || 25;
    const slider = document.getElementById('cv-settings-limit-slider') as HTMLInputElement | null;
    const valueEl = document.getElementById('cv-settings-limit-value');
    if (slider) slider.value = String(limit);
    if (valueEl) valueEl.textContent = String(limit);
  } catch {}
}

async function _saveDailyLimit(limit: number): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('applySettings');
    const settings = stored.applySettings || {};
    settings.dailyApplyLimit = limit;
    await chrome.storage.local.set({ applySettings: settings });
    await chrome.storage.sync.set({ dailyApplyLimit: limit });
    try { chrome.runtime.sendMessage({ type: 'syncApplySettingsToSupabase' }); } catch {}
    try { phCapture('daily_limit_changed', { limit }); } catch {}
  } catch {}
}

function _loadSettingsThreshold(): void {
  const homeSlider = document.getElementById('cv-threshold-slider') as HTMLInputElement | null;
  const settingsSlider = document.getElementById('cv-settings-threshold-slider') as HTMLInputElement | null;
  const settingsValue = document.getElementById('cv-settings-threshold-value');
  if (homeSlider && settingsSlider) {
    settingsSlider.value = homeSlider.value;
    if (settingsValue) settingsValue.textContent = homeSlider.value;
  }
}

async function _loadSettingsResume(): Promise<void> {
  const resumeInfo = document.getElementById('cv-settings-resume-info');
  if (!resumeInfo) return;
  try {
    const stored = await chrome.storage.local.get('applySettings');
    const resumeId = stored.applySettings?.activeResumeId;
    if (!resumeId) {
      resumeInfo.textContent = 'No resume selected. Select one on the dashboard.';
      return;
    }
    // Get name from home page resume card
    const nameEl = document.getElementById('cv-resume-name');
    const metaEl = document.getElementById('cv-resume-meta');
    const name = nameEl?.textContent || 'Resume selected';
    const meta = metaEl?.textContent || '';
    resumeInfo.innerHTML = `<strong>${_escText(name)}</strong><br><span style="font-size:10px;color:var(--text-faint)">${_escText(meta)}</span>`;
  } catch {
    resumeInfo.textContent = 'Unable to load resume info';
  }
}

// REM-S02: EEOC read-only display on extension settings
async function _loadSettingsEEOC(): Promise<void> {
  const container = document.getElementById('cv-settings-eeoc');
  if (!container) return;
  try {
    const stored = await chrome.storage.local.get('applicantProfile');
    const eeo = stored.applicantProfile?.eeo_preferences;
    if (!eeo || (!eeo.gender && !eeo.ethnicity && !eeo.veteranStatus && !eeo.disabilityStatus && !eeo.citizenshipStatus)) {
      container.innerHTML = '<span style="color:var(--text-faint);font-style:italic;">Not set — configure on the dashboard Applicant Profile tab</span>';
      return;
    }
    const fields: Array<[string, string | null]> = [
      ['Gender', eeo.gender],
      ['Ethnicity', eeo.ethnicity],
      ['Veteran', eeo.veteranStatus],
      ['Disability', eeo.disabilityStatus],
      ['Citizenship', eeo.citizenshipStatus],
    ];
    container.innerHTML = fields
      .map(([label, val]) => `<div><strong>${label}:</strong> ${val ? _escText(val) : '<span style="color:var(--text-faint)">—</span>'}</div>`)
      .join('');
  } catch {
    container.innerHTML = '<span style="color:var(--text-faint)">Unable to load</span>';
  }
}

function _initSettingsListeners(): void {
  // Rewrite preference toggles + B5 page_limit select
  ['cv-settings-preserve-tone', 'cv-settings-add-keywords', 'cv-settings-page-limit'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => _saveRewritePreferences());
  });

  // Daily limit slider
  const limitSlider = document.getElementById('cv-settings-limit-slider') as HTMLInputElement | null;
  const limitValue = document.getElementById('cv-settings-limit-value');
  let _limitDebounce: ReturnType<typeof setTimeout> | null = null;
  if (limitSlider) {
    limitSlider.addEventListener('input', () => {
      if (limitValue) limitValue.textContent = limitSlider.value;
    });
    limitSlider.addEventListener('change', () => {
      if (_limitDebounce) clearTimeout(_limitDebounce);
      _limitDebounce = setTimeout(() => _saveDailyLimit(parseInt(limitSlider.value, 10)), 500);
    });
  }

  // Settings page threshold slider (mirrors home threshold)
  const settingsThreshold = document.getElementById('cv-settings-threshold-slider') as HTMLInputElement | null;
  const settingsThresholdValue = document.getElementById('cv-settings-threshold-value');
  let _thresholdDebounce: ReturnType<typeof setTimeout> | null = null;
  if (settingsThreshold) {
    settingsThreshold.addEventListener('input', () => {
      if (settingsThresholdValue) settingsThresholdValue.textContent = settingsThreshold.value;
      // Mirror to home slider
      const homeSlider = document.getElementById('cv-threshold-slider') as HTMLInputElement | null;
      const homeValue = document.getElementById('cv-threshold-value');
      if (homeSlider) homeSlider.value = settingsThreshold.value;
      if (homeValue) homeValue.textContent = settingsThreshold.value;
    });
    settingsThreshold.addEventListener('change', () => {
      if (_thresholdDebounce) clearTimeout(_thresholdDebounce);
      _thresholdDebounce = setTimeout(async () => {
        const val = parseInt(settingsThreshold.value, 10);
        await chrome.storage.sync.set({ scoreThreshold: val });
        const stored = await chrome.storage.local.get('applySettings');
        const settings = stored.applySettings || {};
        settings.scoreThreshold = val;
        await chrome.storage.local.set({ applySettings: settings });
        try { chrome.runtime.sendMessage({ type: 'syncApplySettingsToSupabase' }); } catch {}
      }, 500);
    });
  }

  // Clear activity button
  const clearBtn = document.getElementById('cv-activity-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await chrome.storage.local.set({ activityFeed: [] });
      _loadActivityFeed();
      _loadFullActivityFeed();
      try { phCapture('activity_feed_cleared', {}); } catch {}
    });
  }
}

// ============================================================
// EXT-AS-8: PIPELINE PAGE
// ============================================================

interface PipelineJob {
  id: string;
  job_title: string;
  company_name: string;
  stage: string;
  created_at: string;
}

async function _loadPipelinePageData(): Promise<void> {
  // Update stage counts (mirror from home page)
  const stages = ['saved', 'applied', 'interview', 'offer'];
  stages.forEach(stage => {
    const homeEl = document.getElementById(`cv-pipe-${stage}`);
    const pageEl = document.getElementById(`cv-pipe2-${stage}`);
    if (homeEl && pageEl) pageEl.textContent = homeEl.textContent || '0';
  });

  // Load recent pipeline items from background
  const jobsList = document.getElementById('cv-pipe-jobs-list');
  if (!jobsList) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'getPipelineItems', limit: 20 });
    if (response?.items && response.items.length > 0) {
      const items: PipelineJob[] = response.items;
      jobsList.innerHTML = items.map((item: PipelineJob) => {
        const stageLower = (item.stage || 'saved').toLowerCase();
        return `<div class="cv-pipe-job-item">
          <div class="cv-pipe-job-dot ${_escText(stageLower)}"></div>
          <div class="cv-pipe-job-info">
            <div class="cv-pipe-job-title">${_escText(item.job_title || 'Untitled')}</div>
            <div class="cv-pipe-job-company">${_escText(item.company_name || 'Unknown')}</div>
          </div>
          <span class="cv-pipe-job-stage ${_escText(stageLower)}">${_escText(stageLower)}</span>
        </div>`;
      }).join('');
    } else {
      jobsList.innerHTML = '<div class="cv-pipe-empty">No pipeline items yet. Save jobs from job sites!</div>';
    }
  } catch {
    jobsList.innerHTML = '<div class="cv-pipe-empty">Unable to load pipeline</div>';
  }
}

// ============================================================
// EXT-AS-8: FULL ACTIVITY FEED
// ============================================================

async function _loadFullActivityFeed(): Promise<void> {
  const container = document.getElementById('cv-activity-full-list');
  if (!container) return;

  try {
    const stored = await chrome.storage.local.get('activityFeed');
    const feed: ActivityItem[] = stored.activityFeed || [];

    if (feed.length === 0) {
      container.innerHTML = '<div class="cv-activity-empty">No recent activity</div>';
      return;
    }

    // Show all items (up to 50), newest first
    const sorted = [...feed].reverse();
    container.innerHTML = sorted.map(item => {
      const dotColor = _activityDotColor(item.type);
      const label = _activityLabel(item.type);
      return `<div class="cv-activity-item">
        <div class="cv-activity-dot ${dotColor}"></div>
        <div>
          <div class="cv-activity-text"><strong>${_escText(item.jobTitle)}</strong> at ${_escText(item.company)} — ${label}${item.score !== undefined ? ` (Score: ${item.score})` : ''}</div>
          <div class="cv-activity-time">${_relativeTime(item.timestamp)}</div>
        </div>
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<div class="cv-activity-empty">Unable to load activity</div>';
  }
}

// ============================================================
// EXT-AS-8: TEXT ESCAPER
// ============================================================

function _escText(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// POSTHOG HELPER
// ============================================================

function phCapture(event: string, props: Record<string, unknown>): void {
  try {
    if (typeof (window as any).posthog !== 'undefined') {
      (window as any).posthog.capture(event, props);
    }
  } catch {}
}

// ============================================================
// EXT-BUILD-001 S2.4: Update Banner
// ============================================================

function _initUpdateBanner(): void {
  const banner = document.getElementById('cv-update-banner');
  if (!banner) return;

  // Check cached version data on popup open
  chrome.storage.local.get('_bjVersionCheck', (result) => {
    const vd = result._bjVersionCheck;
    if (!vd || !vd.isBehind) return;

    // Check if user dismissed this version
    chrome.storage.local.get('_bjVersionDismissed', (dismissResult) => {
      if (dismissResult._bjVersionDismissed === vd.latest) return;
      _showUpdateBanner(vd.current, vd.latest, vd.download_url);
    });
  });

  // Listen for real-time version updates from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'versionUpdate' && msg.isBehind) {
      chrome.storage.local.get('_bjVersionDismissed', (dismissResult) => {
        if (dismissResult._bjVersionDismissed === msg.latest) return;
        _showUpdateBanner(msg.current, msg.latest, msg.download_url);
      });
    }
  });

  // Dismiss button
  const dismissBtn = document.getElementById('cv-update-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      banner.style.display = 'none';
      // Get current latest to persist dismissal
      chrome.storage.local.get('_bjVersionCheck', (r) => {
        if (r._bjVersionCheck?.latest) {
          chrome.storage.local.set({ _bjVersionDismissed: r._bjVersionCheck.latest });
        }
      });
      phCapture('update_banner_dismissed', {});
    });
  }

  // Download button
  const dlBtn = document.getElementById('cv-update-download-btn');
  if (dlBtn) {
    dlBtn.addEventListener('click', async () => {
      const statusEl = document.getElementById('cv-update-status');
      try {
        (dlBtn as HTMLButtonElement).disabled = true;
        dlBtn.textContent = 'Building...';
        if (statusEl) statusEl.textContent = 'Generating your personalized build...';

        // Get auth token
        const storage = await chrome.storage.local.get(['accessToken']);
        const token = storage.accessToken;
        if (!token) {
          if (statusEl) statusEl.textContent = 'Not logged in. Open dashboard to log in first.';
          return;
        }

        const SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
        const res = await fetch(`${SB_URL}/functions/v1/build-extension`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).error || `Build failed (${res.status})`);
        }

        const blob = await res.blob();
        const buildId = res.headers.get('X-Build-Id') || 'unknown';
        const url = URL.createObjectURL(blob);

        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `brilliant-jobs-extension-${buildId.slice(3, 11)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        dlBtn.textContent = 'Downloaded!';
        if (statusEl) statusEl.textContent = 'Unzip and reload in chrome://extensions';
        phCapture('update_downloaded_from_popup', { build_id: buildId });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (statusEl) statusEl.textContent = '✗ ' + msg;
        dlBtn.textContent = 'Download Update';
        (dlBtn as HTMLButtonElement).disabled = false;
      }
    });
  }
}

function _showUpdateBanner(current: string, latest: string, downloadUrl?: string): void {
  const banner = document.getElementById('cv-update-banner');
  if (!banner) return;

  const currentEl = document.getElementById('cv-update-current');
  const latestEl = document.getElementById('cv-update-latest');
  if (currentEl) currentEl.textContent = current;
  if (latestEl) latestEl.textContent = latest;

  banner.style.display = '';
  phCapture('update_banner_shown', { current, latest });
}

// ============================================================
// EXPORTS
// ============================================================

// Expose for popup.ts integration
(window as any).initConsumerPopup = initConsumerPopup;
(window as any).addActivityItem = addActivityItem;
(window as any).navigateConsumerPage = _navigateToPage;
