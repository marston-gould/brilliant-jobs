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
