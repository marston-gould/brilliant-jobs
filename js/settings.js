// Stats — now powered by stats.js (ECharts dashboard)
function loadStats() {
  // Lazy-init: stats.js handles everything via initStatsPage()
  // Called on app init and when navigating to Stats tab
  if (typeof initStatsPage === 'function') {
    initStatsPage();
  }
}

// Account (Settings page)
$('#st-change-pw')?.addEventListener('click', async () => {
  try {
    const { error } = await sb.auth.resetPasswordForEmail(currentUser.email, { redirectTo: window.location.origin });
    if (error) throw error;
    showToast('Password reset email sent — check your inbox.', { type: 'success' });
  } catch (e) { showToast('Password reset failed: ' + e.message, { type: 'error' }); }
});
$('#st-export')?.addEventListener('click', async () => {
  try {
    const { data } = await sb.from('connections').select('*').limit(5000);
    if (!data?.length) { showToast('Nothing to export yet — start tracking applications first.', { type: 'info' }); return; }
    const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `brilliant-jobs-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { showToast('Export failed: ' + e.message, { type: 'error' }); }
});

// Logout
$('#logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = '/';
});


// ---- AI Scoring Preferences (v6.44 Session 4.1) ----
var _userAiScoringPrefs = { mixed_content: false, ai_generated: false };
var _aiPrefsDebounceTimer = null;

async function loadAiScoringPrefs() {
  try {
    if (typeof sb === 'undefined' || !currentUser) return;
    var { data, error } = await sb
      .from('profiles')
      .select('ai_scoring_prefs')
      .eq('id', currentUser.id)
      .single();
    if (error) { console.warn('[BJ] AI prefs load error:', error.message); return; }
    if (data && data.ai_scoring_prefs) {
      _userAiScoringPrefs = data.ai_scoring_prefs;
    }
    // Sync UI toggles
    var mixedEl = document.getElementById('ai-pref-mixed');
    var aiGenEl = document.getElementById('ai-pref-ai-generated');
    if (mixedEl) mixedEl.checked = !!_userAiScoringPrefs.mixed_content;
    if (aiGenEl) aiGenEl.checked = !!_userAiScoringPrefs.ai_generated;
  } catch (e) {
    console.warn('[BJ] AI prefs load exception:', e);
  }
}

async function saveAiScoringPrefs() {
  try {
    if (typeof sb === 'undefined' || !currentUser) return;
    var { error } = await sb
      .from('profiles')
      .update({ ai_scoring_prefs: _userAiScoringPrefs })
      .eq('id', currentUser.id);
    if (error) throw error;
    if (typeof showToast === 'function') showToast('AI scoring preferences updated', { type: 'success' });
  } catch (e) {
    console.error('[BJ] AI prefs save error:', e);
    if (typeof showToast === 'function') showToast('Failed to save AI preferences', { type: 'error' });
  }
}

function initAiScoringPrefs() {
  loadAiScoringPrefs();
  document.querySelectorAll('#ai-pref-mixed, #ai-pref-ai-generated').forEach(function(toggle) {
    toggle.addEventListener('change', function() {
      var label = this.dataset.aiLabel;
      _userAiScoringPrefs[label] = this.checked;
      // Debounce save
      if (_aiPrefsDebounceTimer) clearTimeout(_aiPrefsDebounceTimer);
      _aiPrefsDebounceTimer = setTimeout(function() { saveAiScoringPrefs(); }, 500);
      // PostHog
      if (typeof posthog !== 'undefined') {
        posthog.capture('ai_scoring_pref_changed', { label: label, excluded: _userAiScoringPrefs[label], source: 'settings' });
      }
      // Dispatch event so job-feed.js can react
      window.dispatchEvent(new CustomEvent('ai-scoring-prefs-changed', { detail: _userAiScoringPrefs }));
    });
  });
}

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(initAiScoringPrefs, 500); });
} else {
  setTimeout(initAiScoringPrefs, 500);
}

// ---- Feedback Modal ----
let fbType = 'bug';
let fbFiles = []; // array of { file, dataUrl }

function setFbType(type) {
  fbType = type;
  $$('.fb-type-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.type === type) b.classList.add('active');
  });
  const icon = $('#fb-heading-icon');
  if (type === 'bug') {
    $('#fb-heading-text').textContent = 'Report a Bug';
    $('#fb-subheading').textContent = 'Found something off? Help us fix it.';
    $('#fb-title-label').textContent = 'What happened?';
    $('#fb-title').placeholder = 'Brief description of the issue…';
    $('#fb-details').placeholder = 'Steps to reproduce, expected vs actual behavior…';
    $('#fb-bug-help').style.display = '';
    icon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
    icon.style.stroke = 'var(--red)';
  } else {
    $('#fb-heading-text').textContent = 'Request a Feature';
    $('#fb-subheading').textContent = "Have a brilliant idea? We're listening.";
    $('#fb-title-label').textContent = 'What would you like?';
    $('#fb-title').placeholder = 'Brief description of the feature idea…';
    $('#fb-details').placeholder = 'How would this help your job search? Any specifics on how it should work…';
    $('#fb-bug-help').style.display = 'none';
    icon.innerHTML = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="none"/>';
    icon.style.stroke = 'var(--accent)';
  }
}

function handleFbFiles(fileList) {
  for (const file of fileList) {
    if (fbFiles.length >= 3) break;
    if (file.size > 5 * 1024 * 1024) { showToast(file.name + ' is over 5MB', { type: 'error' }); continue; }
    if (!file.type.startsWith('image/')) { showToast(file.name + ' is not an image', { type: 'error' }); continue; }
    const reader = new FileReader();
    reader.onload = e => {
      fbFiles.push({ file, dataUrl: e.target.result });
      renderFbThumbs();
    };
    reader.readAsDataURL(file);
  }
}

function renderFbThumbs() {
  const container = $('#fb-file-list');
  container.innerHTML = fbFiles.map((f, i) =>
    '<div class="fb-thumb">' +
      '<img src="' + f.dataUrl + '" alt="upload">' +
      '<div class="fb-thumb-x" data-idx="' + i + '">✕</div>' +
    '</div>'
  ).join('');
  container.querySelectorAll('.fb-thumb-x').forEach(x => {
    x.addEventListener('click', () => {
      fbFiles.splice(parseInt(x.dataset.idx), 1);
      renderFbThumbs();
    });
  });
}

// Drag and drop on upload zone
(function() {
  const zone = document.getElementById('fb-upload-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFbFiles(e.dataTransfer.files);
  });
})();

function openFeedback() {
  const activePage = document.querySelector('.page.active');
  const pageId = activePage?.id?.replace('page-', '') || '';
  const fbPage = $('#fb-page');
  if (fbPage) {
    const opt = [...fbPage.options].find(o => o.value === pageId);
    fbPage.value = opt ? pageId : '';
  }
  $('#fb-title').value = '';
  $('#fb-details').value = '';
  $('#fb-priority').value = 'medium';
  fbFiles = [];
  renderFbThumbs();
  setFbType('bug');
  $('#fb-form-view').style.display = '';
  $('#fb-success-view').style.display = 'none';
  $('#fb-submit-btn').disabled = false;
  $('#fb-submit-btn').textContent = 'Submit';
  $('#feedback-overlay').classList.add('open');
  setTimeout(() => $('#fb-title').focus(), 100);
}

function closeFeedback() {
  $('#feedback-overlay').classList.remove('open');
}

async function submitFeedback() {
  const title = $('#fb-title').value.trim();
  if (!title) { $('#fb-title').focus(); return; }

  const btn = $('#fb-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  // Upload images to Supabase Storage
  const imageUrls = [];
  for (const f of fbFiles) {
    try {
      const ext = f.file.name.split('.').pop() || 'png';
      const path = 'feedback/' + (currentUser?.id || 'anon') + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + '.' + ext;
      const { data, error } = await sb.storage.from('feedback-uploads').upload(path, f.file, { contentType: f.file.type });
      if (!error && data) {
        const { data: urlData } = sb.storage.from('feedback-uploads').getPublicUrl(path);
        if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
      }
    } catch (e) { console.warn('[BJ] File upload failed:', e); toastError('File upload failed'); }
  }

  const payload = {
    user_id: currentUser?.id || null,
    user_email: currentUser?.email || null,
    type: fbType,
    page: $('#fb-page').value || null,
    title: title,
    details: $('#fb-details').value.trim() || null,
    priority: $('#fb-priority').value,
    image_urls: imageUrls.length > 0 ? imageUrls : null,
    user_agent: navigator.userAgent,
    screen_size: window.innerWidth + 'x' + window.innerHeight,
    dashboard_version: BJ_VERSION,
  };

  try {
    const { error } = await sb.from('feedback').insert(payload);
    if (error) throw error;
    if (fbType === 'bug') {
      $('#fb-success-icon').textContent = '✓';
      $('#fb-success-icon').style.color = 'var(--green)';
      $('#fb-success-title').textContent = 'Bug report submitted!';
      $('#fb-success-msg').textContent = "We'll investigate and keep you posted.";
    } else {
      $('#fb-success-icon').textContent = '✓';
      $('#fb-success-icon').style.color = 'var(--accent)';
      $('#fb-success-title').textContent = 'Feature request received!';
      $('#fb-success-msg').textContent = "We'll review it and see what we can build.";
    }
    $('#fb-form-view').style.display = 'none';
    $('#fb-success-view').style.display = 'flex';
  } catch (e) {
    console.error('[BJ] Feedback submit error:', e); toastError('Failed to submit feedback');
    showToast('Failed to submit feedback. Please try again.', { type: 'error' });
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

$('#feedback-btn').addEventListener('click', openFeedback);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#feedback-overlay').classList.contains('open')) closeFeedback();
});


// ---- Passive Mode (v6.78 Phase 16 Session 1) ----
var _passiveMode = false;
var _passiveConfig = {
  match_score_floor: 85,
  min_salary: null,
  required_remote: false,
  required_level: null,
  target_companies: [],
  active_filters: [],
  frequency_preset: 'high_bar',
  score_floor: 85
};
var _passiveDebounceTimer = null;

async function loadPassiveMode() {
  try {
    if (typeof sb === 'undefined' || !currentUser) return;
    var { data, error } = await sb
      .from('profiles')
      .select('passive_mode, passive_config')
      .eq('id', currentUser.id)
      .single();
    if (error) { console.warn('[BJ] Passive mode load error:', error.message); return; }
    if (data) {
      _passiveMode = !!data.passive_mode;
      if (data.passive_config) _passiveConfig = Object.assign(_passiveConfig, data.passive_config);
    }
    syncPassiveUI();
  } catch (e) { console.warn('[BJ] Passive mode load exception:', e); }
}

function syncPassiveUI() {
  var toggle = document.getElementById('passive-mode-toggle');
  var panel = document.getElementById('passive-threshold-panel');
  var badge = document.getElementById('passive-mode-badge');
  if (toggle) toggle.checked = _passiveMode;
  if (panel) panel.style.display = _passiveMode ? 'block' : 'none';
  if (badge) { badge.textContent = _passiveMode ? 'Passive' : 'Active'; badge.className = 'passive-mode-badge ' + (_passiveMode ? 'passive' : 'active'); }
  // Sync threshold inputs
  var scoreSlider = document.getElementById('passive-score-floor');
  var scoreDisplay = document.getElementById('passive-score-display');
  var salaryInput = document.getElementById('passive-min-salary');
  var remoteToggle = document.getElementById('passive-required-remote');
  var levelSelect = document.getElementById('passive-required-level');
  if (scoreSlider) { scoreSlider.value = _passiveConfig.match_score_floor || 85; }
  if (scoreDisplay) { scoreDisplay.textContent = (_passiveConfig.match_score_floor || 85) + '%'; }
  if (salaryInput) { salaryInput.value = _passiveConfig.min_salary || ''; }
  if (remoteToggle) { remoteToggle.checked = !!_passiveConfig.required_remote; }
  if (levelSelect) { levelSelect.value = _passiveConfig.required_level || ''; }
}

async function savePassiveMode() {
  try {
    if (typeof sb === 'undefined' || !currentUser) return;
    var { error } = await sb
      .from('profiles')
      .update({ passive_mode: _passiveMode, passive_config: _passiveConfig })
      .eq('id', currentUser.id);
    if (error) throw error;
    // Suppress daily digest when passive ON
    await syncPassiveNotificationChannels();
    if (typeof showToast === 'function') showToast('Mode saved', { type: 'success' });
  } catch (e) {
    console.error('[BJ] Passive mode save error:', e);
    if (typeof showToast === 'function') showToast('Failed to save passive mode', { type: 'error' });
  }
}

async function syncPassiveNotificationChannels() {
  try {
    if (!currentUser) return;
    // When passive ON: suppress new_jobs_daily by setting frequency = 'none'
    // When passive OFF: restore to 'daily'
    var freq = _passiveMode ? 'none' : 'daily';
    await sb.from('notification_channels')
      .upsert({ user_id: currentUser.id, notification_type: 'new_jobs_daily', frequency: freq }, { onConflict: 'user_id,notification_type' });
  } catch (e) { console.warn('[BJ] Passive notification channel sync error:', e); }
}

function debounceSavePassiveConfig() {
  if (_passiveDebounceTimer) clearTimeout(_passiveDebounceTimer);
  _passiveDebounceTimer = setTimeout(function() { savePassiveMode(); }, 500);
}

function initPassiveMode() {
  loadPassiveMode();

  // Main toggle
  var toggle = document.getElementById('passive-mode-toggle');
  if (toggle) {
    toggle.addEventListener('change', function() {
      _passiveMode = this.checked;
      syncPassiveUI();
      savePassiveMode();
      if (typeof posthog !== 'undefined') {
        posthog.capture('passive_mode_toggled', { enabled: _passiveMode, config: _passiveConfig, source: 'settings' });
      }
    });
  }

  // Score floor slider
  var scoreSlider = document.getElementById('passive-score-floor');
  var scoreDisplay = document.getElementById('passive-score-display');
  if (scoreSlider) {
    scoreSlider.addEventListener('input', function() {
      var val = parseInt(this.value, 10);
      _passiveConfig.match_score_floor = val;
      _passiveConfig.score_floor = val;
      if (scoreDisplay) scoreDisplay.textContent = val + '%';
      if (typeof posthog !== 'undefined') posthog.capture('passive_threshold_changed', { field: 'score_floor', value: val });
      debounceSavePassiveConfig();
    });
  }

  // Min salary
  var salaryInput = document.getElementById('passive-min-salary');
  if (salaryInput) {
    salaryInput.addEventListener('input', function() {
      _passiveConfig.min_salary = this.value ? parseInt(this.value, 10) : null;
      if (typeof posthog !== 'undefined') posthog.capture('passive_threshold_changed', { field: 'min_salary', value: _passiveConfig.min_salary });
      debounceSavePassiveConfig();
    });
  }

  // Remote toggle
  var remoteToggle = document.getElementById('passive-required-remote');
  if (remoteToggle) {
    remoteToggle.addEventListener('change', function() {
      _passiveConfig.required_remote = this.checked;
      if (typeof posthog !== 'undefined') posthog.capture('passive_threshold_changed', { field: 'required_remote', value: this.checked });
      debounceSavePassiveConfig();
    });
  }

  // Level select
  var levelSelect = document.getElementById('passive-required-level');
  if (levelSelect) {
    levelSelect.addEventListener('change', function() {
      _passiveConfig.required_level = this.value || null;
      if (typeof posthog !== 'undefined') posthog.capture('passive_threshold_changed', { field: 'required_level', value: this.value });
      debounceSavePassiveConfig();
    });
  }
}

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(initPassiveMode, 600); });
} else {
  setTimeout(initPassiveMode, 600);
}

// ---- Passive Frequency Presets (v6.79 Phase 16 Session 2) ----
var PASSIVE_PRESETS = {
  slam_dunk: {
    label: 'Slam-dunk only',
    description: '1–2 alerts/month · 90%+ match required',
    score_floor: 90,
    frequency_preset: 'slam_dunk'
  },
  high_bar: {
    label: 'High bar',
    description: '1–2 alerts/week · 85%+ match required',
    score_floor: 85,
    frequency_preset: 'high_bar'
  },
  curated_daily: {
    label: 'Curated daily',
    description: 'Daily digest · 80%+ match required',
    score_floor: 80,
    frequency_preset: 'curated_daily'
  }
};

function syncPassivePresetUI() {
  var preset = (_passiveConfig.frequency_preset) || 'high_bar';
  var cards = document.querySelectorAll('.passive-preset-card');
  cards.forEach(function(card) {
    var p = card.getAttribute('data-preset');
    if (p === preset) {
      card.classList.add('selected');
      card.style.borderColor = 'var(--accent)';
      card.style.background = 'var(--bg-hover)';
    } else {
      card.classList.remove('selected');
      card.style.borderColor = 'var(--border)';
      card.style.background = 'var(--bg-card)';
    }
  });
  // Update score floor to match preset when passive UI loads
  var presetDef = PASSIVE_PRESETS[preset];
  if (presetDef) {
    _passiveConfig.match_score_floor = presetDef.score_floor;
    _passiveConfig.score_floor = presetDef.score_floor;
    var scoreSlider = document.getElementById('passive-score-floor');
    var scoreDisplay = document.getElementById('passive-score-display');
    if (scoreSlider) scoreSlider.value = presetDef.score_floor;
    if (scoreDisplay) scoreDisplay.textContent = presetDef.score_floor + '%';
  }
}

function selectPassivePreset(presetKey) {
  var presetDef = PASSIVE_PRESETS[presetKey];
  if (!presetDef) return;
  _passiveConfig.frequency_preset = presetDef.frequency_preset;
  _passiveConfig.match_score_floor = presetDef.score_floor;
  _passiveConfig.score_floor = presetDef.score_floor;
  syncPassivePresetUI();
  debounceSavePassiveConfig();
  if (typeof posthog !== 'undefined') {
    posthog.capture('passive_frequency_changed', { preset: presetKey, score_floor: presetDef.score_floor });
  }
}

function initPassivePresets() {
  var cards = document.querySelectorAll('.passive-preset-card');
  cards.forEach(function(card) {
    card.addEventListener('click', function() {
      var preset = this.getAttribute('data-preset');
      if (preset) selectPassivePreset(preset);
    });
  });
  // Extend syncPassiveUI to also sync presets
  var origSyncPassiveUI = syncPassiveUI;
  syncPassiveUI = function() {
    origSyncPassiveUI();
    syncPassivePresetUI();
  };
  // Sync on init if passive already loaded
  syncPassivePresetUI();
}

// Wire initPassivePresets after passive mode init
(function() {
  var origInitPassiveMode = initPassiveMode;
  initPassiveMode = function() {
    origInitPassiveMode();
    setTimeout(initPassivePresets, 100);
  };
})();

// ═══════════════════════════════════════════════════════════
// PASSIVE SNOOZE CONTROLS (Phase 16 Session 3 — v6.80)
// Snooze & Conditional Wake for passive mode
// ═══════════════════════════════════════════════════════════

var SNOOZE_OPTIONS = [
  { value: '1w',  label: '1 week',      days: 7   },
  { value: '2w',  label: '2 weeks',     days: 14  },
  { value: '1m',  label: '1 month',     days: 30  },
  { value: 'indef', label: 'Indefinitely', days: 36500 }
];

function getSnoozeUntilDate(optionValue) {
  var opt = SNOOZE_OPTIONS.find(function(o) { return o.value === optionValue; });
  if (!opt) return null;
  var d = new Date();
  d.setDate(d.getDate() + opt.days);
  return d.toISOString();
}

function formatSnoozeDate(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  // Check for indefinite (far future)
  if (d.getFullYear() > new Date().getFullYear() + 50) return 'indefinitely';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function isCurrentlySnoozed() {
  if (!_passiveConfig) return false;
  var snoozeUntil = _passiveConfig.snoozed_until;
  if (!snoozeUntil) return false;
  return new Date(snoozeUntil) > new Date();
}

function getSnoozedUntilValue() {
  if (!_passiveConfig) return null;
  return _passiveConfig.snoozed_until || null;
}

function syncSnoozeUI() {
  var badge = document.getElementById('passive-snooze-badge');
  var resumeBtn = document.getElementById('passive-snooze-resume-btn');
  var snoozePanel = document.getElementById('passive-snooze-panel');

  if (!badge) return;

  var snoozed = isCurrentlySnoozed();
  var snoozeUntil = getSnoozedUntilValue();

  if (snoozed && snoozeUntil) {
    badge.style.display = 'inline-flex';
    badge.textContent = 'Paused until ' + formatSnoozeDate(snoozeUntil);
    if (resumeBtn) resumeBtn.style.display = 'inline-block';
    if (snoozePanel) snoozePanel.style.display = 'none';
  } else {
    badge.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';
    // Don't show snooze panel — only shown when user clicks snooze button
  }
}

function activateSnooze(durationValue) {
  if (!_passiveConfig) return;
  var until = getSnoozeUntilDate(durationValue);
  if (!until) return;

  _passiveConfig.snoozed_until = until;
  syncSnoozeUI();
  debounceSavePassiveConfig();

  var opt = SNOOZE_OPTIONS.find(function(o) { return o.value === durationValue; });
  if (typeof posthog !== 'undefined') {
    posthog.capture('passive_snoozed', {
      duration: durationValue,
      expires_at: until
    });
  }
  // Hide snooze panel after activating
  var snoozePanel = document.getElementById('passive-snooze-panel');
  if (snoozePanel) snoozePanel.style.display = 'none';
}

function clearSnooze() {
  if (!_passiveConfig) return;
  delete _passiveConfig.snoozed_until;
  syncSnoozeUI();
  debounceSavePassiveConfig();

  if (typeof posthog !== 'undefined') {
    posthog.capture('passive_woken_manually');
  }
}

function conditionalWakeCheck() {
  // If passive mode is on AND snoozed AND user activates a filter → auto-wake
  if (!_passiveConfig || !isCurrentlySnoozed()) return;
  clearSnooze();
  // Show a brief toast if possible
  if (typeof showToast === 'function') {
    showToast('Passive mode resumed — you activated a filter.', 'info');
  }
}

function initPassiveSnooze() {
  var snoozeToggleBtn = document.getElementById('passive-snooze-btn');
  var snoozePanel = document.getElementById('passive-snooze-panel');
  var resumeBtn = document.getElementById('passive-snooze-resume-btn');

  if (snoozeToggleBtn && snoozePanel) {
    snoozeToggleBtn.addEventListener('click', function() {
      var isVisible = snoozePanel.style.display !== 'none';
      snoozePanel.style.display = isVisible ? 'none' : 'block';
    });
  }

  // Wire duration selector buttons
  var durationBtns = document.querySelectorAll('.passive-snooze-duration-btn');
  durationBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var dur = this.getAttribute('data-duration');
      if (dur) activateSnooze(dur);
    });
  });

  // Resume/clear snooze button
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function() {
      clearSnooze();
    });
  }

  syncSnoozeUI();
}

// Extend initPassiveMode to also init snooze
(function() {
  var origInitPassiveMode2 = initPassiveMode;
  initPassiveMode = function() {
    origInitPassiveMode2();
    setTimeout(initPassiveSnooze, 150);
  };
})();

// Conditional wake: hook into filter activation
(function() {
  if (typeof window._conditionalWakeHooked === 'undefined') {
    window._conditionalWakeHooked = true;
    // Watch for filter activation events dispatched from filters.js
    document.addEventListener('bj:filter-activated', function() {
      if (_passiveConfig && _passiveConfig.passive_mode) {
        conditionalWakeCheck();
      }
    });
  }
})();


// ═══════════════════════════════════════════════════════════
// RESUME-FIRST FILTER BOOTSTRAP (Phase 16 Session 5 — v6.82)
// On passive mode ON with no active filters, auto-bootstrap
// 1-3 job filters from resume profile via extract-resume-profile EF.
// ═══════════════════════════════════════════════════════════

async function bootstrapFiltersFromResume() {
  try {
    // Guard: only run when passive mode is being turned ON
    if (!_passiveMode) return;

    // Guard: skip if user already has 1+ saved filters
    var existingFilters = safeReadLS('bj_saved_filters', []);
    if (existingFilters.length > 0) return;

    // Guard: need a resume text to work from
    if (typeof sb === 'undefined' || !currentUser) return;
    var { data: resumeRows, error: rtErr } = await sb
      .from('resume_texts')
      .select('extracted_text, source_filename')
      .eq('user_id', currentUser.id)
      .order('extracted_at', { ascending: false })
      .limit(1);
    if (rtErr || !resumeRows || resumeRows.length === 0) return;

    var resumeText = resumeRows[0].extracted_text;
    if (!resumeText || resumeText.length < 50) return;

    // Call extract-resume-profile EF
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;

    var resp = await fetch(
      'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/extract-resume-profile',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY : ''
        },
        body: JSON.stringify({ resume_text: resumeText })
      }
    );
    if (!resp.ok) { console.warn('[BJ] extract-resume-profile failed:', resp.status); return; }
    var result = await resp.json();
    var profile = result.profile;
    if (!profile || !profile.titles || profile.titles.length === 0) return;

    // Build up to 3 filters from top titles
    var newFilters = [];
    var titles = profile.titles.slice(0, 3);
    titles.forEach(function(title, idx) {
      // Build whatPills from title keywords (split and deduplicate)
      var titleWords = title.split(/\s+/).filter(function(w) {
        return w.length > 2 && !/^(and|the|of|in|at|for|to|a|an)$/i.test(w);
      });
      var filter = {
        name: title,
        whatPills: titleWords,
        wherePills: [],
        whenPills: [],
        whoPills: [],
        payPills: [],
        whatNotPills: [],
        whereNotPills: [],
        whoNotPills: [],
        includeRemote: !!profile.remote_preference && profile.remote_preference === 'remote',
        includeNoSalary: true,
        _bootstrapped: true,
        _bootstrappedAt: new Date().toISOString()
      };
      newFilters.push(filter);
    });

    if (newFilters.length === 0) return;

    // Persist to localStorage
    saveUserData('bj_saved_filters', JSON.stringify(newFilters));
    savedFilters = newFilters;

    // Reflect in in-memory state if state.js setSavedFilters exists
    if (typeof setSavedFilters === 'function') {
      setSavedFilters(newFilters);
    }

    // Show toast
    var filterNames = newFilters.map(function(f) { return f.name; }).join(', ');
    if (typeof showToast === 'function') {
      showToast(
        'We created ' + newFilters.length + ' filter' + (newFilters.length > 1 ? 's' : '') +
        ' based on your resume to get started.',
        { type: 'info' }
      );
    }

    // PostHog
    if (typeof posthog !== 'undefined') {
      posthog.capture('passive_resume_bootstrap', {
        filters_created: newFilters.length,
        titles: titles,
        seniority: profile.seniority || null,
        remote_preference: profile.remote_preference || null
      });
    }

    console.log('[BJ] Passive bootstrap: created ' + newFilters.length + ' filter(s) from resume —', titles.join(', '));
  } catch (e) {
    console.warn('[BJ] bootstrapFiltersFromResume exception:', e);
  }
}

// Hook: call bootstrap whenever passive mode is toggled ON
(function() {
  var origInitPassiveMode3 = initPassiveMode;
  initPassiveMode = function() {
    origInitPassiveMode3();
    // Extend the main toggle listener to trigger bootstrap on ON
    var toggle = document.getElementById('passive-mode-toggle');
    if (toggle) {
      toggle.addEventListener('change', function() {
        if (this.checked) {
          // Small delay so savePassiveMode() completes first
          setTimeout(bootstrapFiltersFromResume, 300);
        }
      });
    }
  };
})();

// ── Phase 16 Session 6: autoHirePause ──────────────────────────────────────
// Called from pipeline.js when user moves a job to hired stage.
// Auto-pauses passive mode, shows congrats toast, fires PostHog event.
async function autoHirePause(jobTitle) {
  if (!currentUser) return;
  try {
    // Check if passive mode is currently on
    var passive = safeReadLS('bj_passive_mode');
    var isPassive = passive === 'true' || passive === true;

    // Update DB: set passive_mode = false
    var { error } = await sb
      .from('profiles')
      .update({ passive_mode: false })
      .eq('id', currentUser.id);
    if (error) {
      console.warn('[BJ] autoHirePause DB update error:', error.message);
      return;
    }

    // Update in-memory flag if global exists
    if (typeof _passiveMode !== 'undefined') {
      _passiveMode = false;
    }

    // Update toggle UI if visible (settings panel open)
    var toggle = document.getElementById('passive-mode-toggle');
    if (toggle) toggle.checked = false;

    // Hide passive settings panel if visible
    var panel = document.getElementById('passive-settings-panel');
    if (panel) panel.style.display = 'none';

    // Update passive badge / mode card label if present
    var modeLabel = document.getElementById('search-mode-label');
    if (modeLabel) modeLabel.textContent = 'Active';

    // Show congrats toast (only if passive was on, to avoid noise)
    if (isPassive && typeof showToast === 'function') {
      showToast(
        'Congrats! Passive mode paused — you can re-activate anytime in Settings.',
        { type: 'success', duration: 6000 }
      );
    }

    // PostHog
    if (typeof posthog !== 'undefined') {
      posthog.capture('passive_auto_paused_hired', {
        job_title: jobTitle || null,
        was_passive: isPassive
      });
    }

    console.log('[BJ] autoHirePause: passive mode paused on hired status for', jobTitle || 'unknown job');
  } catch (e) {
    console.warn('[BJ] autoHirePause exception:', e);
  }
}
