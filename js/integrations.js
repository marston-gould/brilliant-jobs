// ============================================================
// POD3-GS: BUG-6 — Shared Connection State
// _connectionState and renderConnectionStatus moved to app.js (shell chunk)
// so they're available before deferred loads. See app.js.
// ============================================================

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
  // Auto-connect using the signed-in user's email
  var email = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : null;
  if (!email) { if (typeof showToast === 'function') showToast('Please sign in first', 'error'); return; }
  gdriveState.connected = true;
  gdriveState.email = email;
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
  if (typeof showToast === 'function') showToast('Google Drive connected', 'success');
};

window.disconnectGoogleDrive = function() {
  if (!confirm('Disconnect Google Drive? Linked files will be removed.')) return;
  gdriveState = { connected: false, files: [] };
  localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
  renderGdriveState();
};

window.addGdriveFile = function() {
  // Show inline input instead of browser prompt
  var container = document.getElementById('gdrive-files');
  if (!container) return;
  var existingInput = container.querySelector('.gdrive-add-inline');
  if (existingInput) { existingInput.querySelector('input').focus(); return; }
  var row = document.createElement('div');
  row.className = 'gdrive-add-inline';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:8px;';
  row.innerHTML = '<input type="text" class="save-filter-name" placeholder="Google Doc name or URL…" style="flex:1;font-size:11px;padding:4px 8px;">' +
    '<button class="btn btn-sm btn-primary" style="font-size:10px;padding:3px 10px;">Add</button>' +
    '<button class="btn btn-sm" style="font-size:10px;padding:3px 8px;" onclick="this.parentElement.remove()">Cancel</button>';
  container.appendChild(row);
  var input = row.querySelector('input');
  input.focus();
  row.querySelector('.btn-primary').addEventListener('click', function() {
    var name = input.value.trim();
    if (!name) { input.style.borderColor = 'var(--red)'; input.focus(); return; }
    var displayName = name.includes('docs.google.com') ? name.split('/').pop() || 'Google Doc' : name;
    gdriveState.files.push({ name: displayName, url: name.includes('docs.google.com') ? name : null, linkedAt: new Date().toLocaleDateString(), id: 'gd_' + Date.now() });
    localStorage.setItem('bj_gdrive', JSON.stringify(gdriveState));
    renderGdriveState();
  });
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') row.querySelector('.btn-primary').click(); if (e.key === 'Escape') row.remove(); });
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
  if (typeof showToast === 'function') showToast(f.name + ' imported as resume', 'success');
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
  // Auto-connect using the signed-in user's email
  var email = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.email : null;
  if (!email) { if (typeof showToast === 'function') showToast('Please sign in first', 'error'); return; }
  gcalState.connected = true;
  gcalState.email = email;
  localStorage.setItem('bj_gcal', JSON.stringify(gcalState));
  renderGcalState();
  if (typeof showToast === 'function') showToast('Google Calendar connected', 'success');
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
