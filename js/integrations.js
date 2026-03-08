// ============================================================
// POD3-GS: BUG-6 — Shared Connection State (single source of truth)
// All connect/disconnect actions update this object first,
// then call renderConnectionStatus() to sync BOTH status bar
// dots AND individual card dots.
// ============================================================
window._connectionState = { ext: false, gmail: false, gcal: false, gdrive: false };

window.renderConnectionStatus = function() {
  var cs = window._connectionState;
  // Status bar dots
  var barExt = document.getElementById('status-ext');
  var barGmail = document.getElementById('status-gmail');
  var barGcal = document.getElementById('status-gcal');
  var barGdrive = document.getElementById('status-gdrive');
  if (barExt) barExt.className = 'setup-status-dot' + (cs.ext ? ' connected' : '');
  if (barGmail) barGmail.className = 'setup-status-dot' + (cs.gmail ? ' connected' : '');
  if (barGcal) barGcal.className = 'setup-status-dot' + (cs.gcal ? ' connected' : '');
  if (barGdrive) barGdrive.className = 'setup-status-dot' + (cs.gdrive ? ' connected' : '');
  // Card header dots
  var cardExt = document.getElementById('ext-dot');
  var cardGmail = document.getElementById('gmail-dot');
  var cardGcal = document.getElementById('gcal-dot');
  var cardGdrive = document.getElementById('gdrive-dot');
  if (cardExt) cardExt.className = 'setup-dot' + (cs.ext ? ' connected' : '');
  if (cardGmail) cardGmail.className = 'setup-dot' + (cs.gmail ? ' connected' : '');
  if (cardGcal) cardGcal.className = 'setup-dot' + (cs.gcal ? ' connected' : '');
  if (cardGdrive) cardGdrive.className = 'setup-dot' + (cs.gdrive ? ' connected' : '');
};

// ============================================================
// GOOGLE DRIVE INTEGRATION
// ============================================================
let gdriveState = safeReadLS('bj_gdrive', {connected: false, files: []});

function renderGdriveState() {
  const connDiv = document.getElementById('gdrive-setup-connected');
  const discDiv = document.getElementById('gdrive-setup-disconnected');
  const addressEl = document.getElementById('gdrive-address');
  const filesSection = $('#gdrive-files');
  const fileList = $('#gdrive-file-list');

  // Update shared state
  window._connectionState.gdrive = gdriveState.connected;
  window.renderConnectionStatus();

  if (gdriveState.connected) {
    if (connDiv) connDiv.style.display = '';
    if (discDiv) discDiv.style.display = 'none';
    if (addressEl) addressEl.textContent = gdriveState.email || 'Google Account';
    if (filesSection) filesSection.style.display = '';

    if (fileList) {
      if (gdriveState.files.length === 0) {
        fileList.innerHTML = '<div style="font-size:12px;color:var(--text-faint);padding:8px 0;">No files linked yet. Click below to link a Google Doc as a resume.</div>';
      } else {
        fileList.innerHTML = gdriveState.files.map((f, i) => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.08);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.name}</div>
              <div style="font-size:10px;color:var(--text-faint);">Linked ${f.linkedAt || ''}</div>
            </div>
            <button class="btn btn-sm" style="font-size:10px;padding:2px 8px;color:var(--accent);background:none;border:1px solid var(--accent);" onclick="importGdriveAsResume(${i})">Import as Resume</button>
            <button style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;padding:2px 4px;" onclick="unlinkGdriveFile(${i})" title="Unlink">✕</button>
          </div>
        `).join('');
      }
    }
  } else {
    if (connDiv) connDiv.style.display = 'none';
    if (discDiv) discDiv.style.display = '';
    if (filesSection) filesSection.style.display = 'none';
  }
}

window.connectGoogleDrive = function() {
  // TODO: Replace with real Google OAuth flow via Supabase Auth
  const email = prompt('Enter your Google account email to connect:');
  if (!email || !email.includes('@')) return;
  gdriveState.connected = true;
  gdriveState.email = email;
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.disconnectGoogleDrive = function() {
  if (!confirm('Disconnect Google Drive? Linked files will be removed.')) return;
  gdriveState = { connected: false, files: [] };
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.addGdriveFile = function() {
  // TODO: Replace with Google Picker API
  const name = prompt('Google Doc name (or paste a Google Docs URL):');
  if (!name || !name.trim()) return;
  const displayName = name.includes('docs.google.com')
    ? name.split('/').pop() || 'Google Doc'
    : name.trim();
  gdriveState.files.push({
    name: displayName,
    url: name.includes('docs.google.com') ? name : null,
    linkedAt: new Date().toLocaleDateString(),
    id: 'gd_' + Date.now()
  });
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.unlinkGdriveFile = function(idx) {
  gdriveState.files.splice(idx, 1);
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.importGdriveAsResume = function(idx) {
  const f = gdriveState.files[idx];
  const resume = {
    id: 'res_gd_' + Date.now(),
    name: f.name.replace(/\.(gdoc|pdf|docx?)$/i, ''),
    fileName: f.name,
    size: 'Google Doc',
    filterIds: [],
    uploadedAt: new Date().toLocaleDateString(),
    source: 'gdrive',
    archived: false,
    levelLabel: '',
    gdriveUrl: f.url,
    gdriveId: f.id
  };
  resumes.push(resume);
  saveResumes();
  renderResumes();
  alert(`"${f.name}" imported as a resume. Go to the Resumes page to assign it to filters.`);
};

renderGdriveState();

// ============================================================
// GOOGLE CALENDAR INTEGRATION (POD3-GS: BUG-7)
// ============================================================
let gcalState = safeReadLS('bj_gcal', { connected: false, email: null });

function renderGcalState() {
  const connDiv = document.getElementById('gcal-setup-connected');
  const discDiv = document.getElementById('gcal-setup-disconnected');
  const addressEl = document.getElementById('gcal-address');
  // Update shared state
  window._connectionState.gcal = gcalState.connected;
  window.renderConnectionStatus();
  if (gcalState.connected) {
    if (connDiv) connDiv.style.display = '';
    if (discDiv) discDiv.style.display = 'none';
    if (addressEl) addressEl.textContent = gcalState.email || 'Google Account';
  } else {
    if (connDiv) connDiv.style.display = 'none';
    if (discDiv) discDiv.style.display = '';
  }
}

window.connectGoogleCalendar = function() {
  // TODO: Replace with real Google OAuth flow via Supabase Auth
  const email = prompt('Enter your Google account email to connect Calendar:');
  if (!email || !email.includes('@')) return;
  gcalState.connected = true;
  gcalState.email = email;
  localStorage.setItem('bj_gcal', JSON.stringify(gcalState));
  renderGcalState();
};

window.disconnectGoogleCalendar = function() {
  if (!confirm('Disconnect Google Calendar?')) return;
  gcalState = { connected: false, email: null };
  localStorage.setItem('bj_gcal', JSON.stringify(gcalState));
  renderGcalState();
};

renderGcalState();


// CS-P1-004 FE-005: Register integrations exports with BJ namespace
(function() {
  ['addGdriveFile','connectGoogleDrive','disconnectGoogleDrive','importGdriveAsResume','unlinkGdriveFile','connectGoogleCalendar','disconnectGoogleCalendar','renderConnectionStatus'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'integrations', registered: Date.now() };
    }
  });
})();
