// popup-consumer.ts — EXT-AS-2: Consumer Popup UI + Mode Persistence
// Manages the Application Mode consumer view, threshold slider,
// pipeline summary, activity feed, and admin legacy toggle.

// ============================================================
// CONSTANTS
// ============================================================

const MODES_USING_SCORING = ['score-gated', 'auto-score-gate', 'auto-rewrite', 'full-autopilot'];

interface ActivityItem {
  id: string;
  type: 'saved' | 'applied' | 'rewrite-offered' | 'rewrite-submitted' | 'auto-submitted';
  jobTitle: string;
  company: string;
  score?: number;
  threshold?: number;
  timestamp: string; // ISO
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

      try { phCapture('mode_changed', { mode }); } catch {}
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
async function addActivityItem(item: Omit<ActivityItem, 'id'>): Promise<void> {
  try {
    const stored = await chrome.storage.local.get('activityFeed');
    const feed: ActivityItem[] = stored.activityFeed || [];

    const newItem: ActivityItem = {
      ...item,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    };

    feed.push(newItem);

    // Prune to max 50
    while (feed.length > 50) feed.shift();

    await chrome.storage.local.set({ activityFeed: feed });

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
      }
    }
    if (changes.activityFeed) {
      _loadActivityFeed();
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
    }
  }
});

// ============================================================
// EXPORTS
// ============================================================

// Expose for popup.ts integration
(window as any).initConsumerPopup = initConsumerPopup;
(window as any).addActivityItem = addActivityItem;
