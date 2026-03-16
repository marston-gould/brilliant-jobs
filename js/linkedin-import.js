// js/linkedin-import.js — AIS-F2-S2: LinkedIn Import UI + Auto-Population
// =========================================================================
// Handles drag-and-drop PDF upload, parse-linkedin-pdf EF call,
// parsed profile preview, auto-population of applicant profile fields,
// filter keyword suggestions from skills, seniority inference.

(function () {
  'use strict';

  var _liParsedProfile = null;
  var _liStoragePath = null;
  var _liPdfHash = null;

  // ── Seniority inference from experience entries ──────────────────────────
  function _inferSeniority(experienceJson) {
    if (!experienceJson || !experienceJson.length) return null;
    var seniorTitles = /director|vp|vice president|head of|principal|staff|distinguished/i;
    var midTitles = /senior|lead|manager|architect/i;
    for (var i = 0; i < Math.min(experienceJson.length, 3); i++) {
      var title = experienceJson[i].title || '';
      if (seniorTitles.test(title)) return 'director';
      if (midTitles.test(title)) return 'senior';
    }
    return null;
  }

  // ── Status display ───────────────────────────────────────────────────────
  function _liSetStatus(msg, type) {
    var el = document.getElementById('li-import-status');
    if (!el) return;
    var color = type === 'error' ? 'var(--warm)' : type === 'success' ? 'var(--green)' : 'var(--accent)';
    el.style.display = 'block';
    el.innerHTML = '<div style="font-size:12px;color:' + color + ';padding:8px 12px;background:var(--bg-card);border-radius:6px;">' + escapeHtml(msg) + '</div>';
  }

  function _liClearStatus() {
    var el = document.getElementById('li-import-status');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  // ── File handling ────────────────────────────────────────────────────────
  window._liHandleDrop = function (evt) {
    evt.preventDefault();
    var zone = document.getElementById('li-import-upload-zone');
    if (zone) zone.style.borderColor = 'var(--border)';
    var file = evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files[0];
    if (file) window._liHandleFile(file);
  };

  window._liHandleFile = function (file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      _liSetStatus('Please upload a PDF file (LinkedIn PDF export).', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      _liSetStatus('File exceeds 10MB limit.', 'error');
      return;
    }
    _liSetStatus('Parsing LinkedIn profile…', 'info');
    document.getElementById('li-import-upload-zone').style.display = 'none';

    var reader = new FileReader();
    reader.onload = function (e) {
      var base64 = e.target.result.split(',')[1];
      _liCallEF(base64, file.name);
    };
    reader.onerror = function () {
      document.getElementById('li-import-upload-zone').style.display = 'block';
      _liSetStatus('Failed to read file.', 'error');
    };
    reader.readAsDataURL(file);
  };

  // ── EF call ──────────────────────────────────────────────────────────────
  async function _liCallEF(base64, filename) {
    try {
      var token = typeof _getAuthToken === 'function' ? await _getAuthToken() : (window._bjSupabaseSession && window._bjSupabaseSession.access_token);
      if (!token) {
        _liSetStatus('Please log in to import your LinkedIn profile.', 'error');
        document.getElementById('li-import-upload-zone').style.display = 'block';
        return;
      }

      var resp = await fetch('https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/parse-linkedin-pdf', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', pdf_base64: base64, filename: filename }),
      });

      var data = await resp.json();

      if (!resp.ok) {
        var msg = data.error || 'Upload failed';
        if (resp.status === 409) msg = 'This PDF has already been used by another account.';
        if (resp.status === 422) msg = 'Could not parse PDF. Please use a LinkedIn PDF export.';
        if (resp.status === 413) msg = 'File exceeds 10MB limit.';
        _liSetStatus(msg, 'error');
        document.getElementById('li-import-upload-zone').style.display = 'block';
        return;
      }

      _liParsedProfile = data.profile;
      _liStoragePath = data.storage_path;
      _liPdfHash = data.pdf_hash;

      // PostHog
      if (typeof capturePostHog === 'function') {
        capturePostHog('linkedin_pdf_uploaded', {
          parse_success: true,
          fields_extracted_count: Object.values(data.profile || {}).filter(Boolean).length,
          skills_count: (data.profile.skills_array || []).length,
          has_experience: !!(data.profile.experience_json && data.profile.experience_json.length),
          fraud_signals: (data.fraud_signals || []).join(',') || 'none',
        });
      }

      _liShowPreview(data.profile, data.fraud_signals || []);
    } catch (e) {
      reportError('linkedin-import:_liCallEF', e);
      _liSetStatus('Upload failed. Please try again.', 'error');
      document.getElementById('li-import-upload-zone').style.display = 'block';
    }
  }

  // ── Preview rendering ────────────────────────────────────────────────────
  function _liShowPreview(profile, fraudSignals) {
    _liClearStatus();
    var preview = document.getElementById('li-import-preview');
    if (!preview) return;

    var esc = typeof escapeHtml === 'function' ? escapeHtml : function (s) { return String(s || ''); };

    document.getElementById('li-preview-name').textContent = profile.display_name || '';
    document.getElementById('li-preview-headline').textContent = profile.headline || '';
    document.getElementById('li-preview-location').textContent = profile.location || '';

    // Skills pills
    var skillsEl = document.getElementById('li-preview-skills');
    skillsEl.innerHTML = (profile.skills_array || []).slice(0, 12).map(function (s) {
      return '<span style="font-size:10px;padding:2px 8px;background:var(--accent-dim);color:var(--accent);border-radius:20px;">' + esc(s) + '</span>';
    }).join('');

    // Experience summary
    var exp = profile.experience_json || [];
    var expEl = document.getElementById('li-preview-exp');
    if (exp.length) {
      expEl.textContent = exp.slice(0, 2).map(function (e) {
        return (e.title || '') + (e.company ? ' @ ' + e.company : '');
      }).filter(Boolean).join(' · ');
    }

    // Fraud warnings
    var fraudEl = document.getElementById('li-fraud-warning');
    if (fraudSignals.length) {
      fraudEl.style.display = 'block';
      var msgs = { low_connections: 'Low connection count — profile may need review', no_experience: 'No experience entries found', low_confidence: 'Low parse confidence' };
      fraudEl.textContent = '⚠ ' + fraudSignals.map(function (s) { return msgs[s] || s; }).join('; ');
    } else {
      fraudEl.style.display = 'none';
    }

    preview.style.display = 'block';
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }

  // ── Save profile ─────────────────────────────────────────────────────────
  window._liSaveProfile = async function () {
    if (!_liParsedProfile || !currentUser) return;
    try {
      var p = _liParsedProfile;

      // Auto-populate applicant profile fields (non-destructive — only fill empty fields)
      var nameField = document.getElementById('ap-first-name');
      var lastField = document.getElementById('ap-last-name');
      var locationField = document.getElementById('ap-location');
      var linkedinField = document.getElementById('ap-linkedin');

      if (p.display_name) {
        var parts = (p.display_name || '').trim().split(' ');
        if (nameField && !nameField.value) nameField.value = parts[0] || '';
        if (lastField && !lastField.value) lastField.value = parts.slice(1).join(' ') || '';
      }
      if (locationField && !locationField.value && p.location) locationField.value = p.location;

      // Suggest filter keywords from skills
      var skills = (p.skills_array || []).slice(0, 5);
      if (skills.length && typeof window.addWhatPill === 'function') {
        skills.forEach(function (skill) { window.addWhatPill(skill, { source: 'linkedin' }); });
        if (typeof showToast === 'function') showToast('Added ' + skills.length + ' skills as filter keywords from your LinkedIn profile.');
      }

      // Infer seniority level
      var inferredLevel = _inferSeniority(p.experience_json);
      if (inferredLevel) {
        var levelSelect = document.getElementById('ap-level');
        if (levelSelect && !levelSelect.value) levelSelect.value = inferredLevel;
      }

      // Save applicant profile to Supabase if save function is available
      if (typeof saveApplicantProfile === 'function') await saveApplicantProfile();

      // Update UI
      document.getElementById('li-import-preview').style.display = 'none';
      var badge = document.getElementById('li-import-done-badge');
      if (badge) badge.style.display = 'flex';
      if (typeof showToast === 'function') showToast('LinkedIn profile imported!', { type: 'success' });

    } catch (e) {
      reportError('linkedin-import:_liSaveProfile', e);
      if (typeof showToast === 'function') showToast('Failed to save profile.', { type: 'error' });
    }
  };

  window._liCancelPreview = function () {
    _liParsedProfile = null;
    _liStoragePath = null;
    _liPdfHash = null;
    var preview = document.getElementById('li-import-preview');
    if (preview) preview.style.display = 'none';
    var zone = document.getElementById('li-import-upload-zone');
    if (zone) zone.style.display = 'block';
    _liClearStatus();
    var input = document.getElementById('li-import-file-input');
    if (input) input.value = '';
  };

  // ── Init: check for existing profile ─────────────────────────────────────
  async function initLinkedInImport() {
    if (!currentUser) return;
    try {
      var { data } = await sb.from('linkedin_profiles').select('display_name,parsed_at').eq('user_id', currentUser.id).maybeSingle();
      if (data) {
        var badge = document.getElementById('li-import-done-badge');
        if (badge) badge.style.display = 'flex';
        var zone = document.getElementById('li-import-upload-zone');
        if (zone) {
          zone.innerHTML = '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px;">Profile already imported: <strong>' + escapeHtml(data.display_name || '') + '</strong><br><span style="font-size:10px;">Re-upload to refresh</span></div>';
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  window.initLinkedInImport = initLinkedInImport;

  // Auto-init on get-started page show
  if (typeof window.BJ !== 'undefined') {
    window.BJ.initLinkedInImport = initLinkedInImport;
    window.BJ._registry.initLinkedInImport = { module: 'linkedin-import', registered: Date.now() };
  }
})();
