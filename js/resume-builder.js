// js/resume-builder.js
// RESUME-BUILDER-001-S1: Upload, Parse, Store
// Handles file upload, paste-text, scratch mode, Anthropic parse via EF,
// editable parsed-data form, and save-to-account.

/* global supabase, BJ_VERSION, captureEvent, reportError, showToast */

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────

  let _state = {
    mode: 'upload',      // 'upload' | 'paste' | 'scratch'
    editorTab: 'contact',
    file: null,          // File object
    resumeId: null,      // uuid — set after first save
    parsedJson: null,    // structured resume data from EF
    dirty: false,        // unsaved edits in editor
    template: 'modern',  // selected template id
  };

  // ─── Init (called when page becomes visible) ──────────────────────────────

  window.rbInit = function () {
    rbBindPasteCounter();
    rbLoadJobSelector();
  };

  // ─── Tab switching ────────────────────────────────────────────────────────

  window.rbSwitchTab = function (tab) {
    _state.mode = tab;
    document.querySelectorAll('.rb-tab').forEach(b => {
      b.classList.toggle('active', b.id === `rb-tab-${tab}`);
      b.setAttribute('aria-selected', b.id === `rb-tab-${tab}` ? 'true' : 'false');
    });
    document.querySelectorAll('.rb-panel').forEach(p => p.classList.add('u-hidden'));
    const panel = document.getElementById(`rb-panel-${tab}`);
    if (panel) panel.classList.remove('u-hidden');
    rbClearError('rb-upload-error');
  };

  window.rbShowEditorTab = function (tab) {
    _state.editorTab = tab;
    document.querySelectorAll('.rb-etab').forEach(b => b.classList.toggle('active', b.dataset.etab === tab));
    document.querySelectorAll('.rb-etab-panel').forEach(p => p.classList.add('u-hidden'));
    const panel = document.getElementById(`rb-etab-${tab}`);
    if (panel) panel.classList.remove('u-hidden');
  };

  // ─── File handling ────────────────────────────────────────────────────────

  window.rbHandleFileSelect = function (input) {
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      rbShowError('rb-upload-error', 'File is too large. Maximum size is 5MB.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      rbShowError('rb-upload-error', 'Please upload a PDF or DOCX file.');
      return;
    }
    _state.file = file;
    rbClearError('rb-upload-error');
    document.getElementById('rb-file-name').textContent = file.name;
    document.getElementById('rb-drop-zone').classList.add('u-hidden');
    document.getElementById('rb-file-selected').classList.remove('u-hidden');
  };

  window.rbHandleDrop = function (e) {
    e.preventDefault();
    document.getElementById('rb-drop-zone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    // Simulate selecting
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.getElementById('rb-file-input');
    input.files = dt.files;
    rbHandleFileSelect(input);
  };

  window.rbClearFile = function () {
    _state.file = null;
    document.getElementById('rb-file-input').value = '';
    document.getElementById('rb-drop-zone')?.classList.remove('u-hidden');
    document.getElementById('rb-file-selected')?.classList.add('u-hidden');
  };

  // ─── Paste counter ────────────────────────────────────────────────────────

  function rbBindPasteCounter () {
    const ta = document.getElementById('rb-paste-area');
    const counter = document.getElementById('rb-paste-count');
    if (!ta || !counter) return;
    ta.addEventListener('input', () => {
      counter.textContent = `${ta.value.length.toLocaleString()} characters`;
    });
  }

  // ─── Parse ────────────────────────────────────────────────────────────────

  window.rbStartParse = async function () {
    rbClearError('rb-upload-error');
    const label = (document.getElementById('rb-label-input')?.value || '').trim() || 'My Resume';

    // Validate input
    if (_state.mode === 'upload' && !_state.file) {
      rbShowError('rb-upload-error', 'Please select a file to upload.');
      return;
    }
    if (_state.mode === 'paste') {
      const text = document.getElementById('rb-paste-area')?.value?.trim() ?? '';
      if (text.length < 50) {
        rbShowError('rb-upload-error', 'Please paste at least 50 characters of resume text.');
        return;
      }
    }
    if (_state.mode === 'scratch') {
      rbLoadBlankEditor(label);
      return;
    }

    // Build form data
    const formData = new FormData();
    if (_state.mode === 'upload') {
      formData.append('file', _state.file);
    } else {
      formData.append('paste_text', document.getElementById('rb-paste-area').value.trim());
    }
    formData.append('label', label);

    rbSetParsing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch('/api/resume-parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const json = await resp.json();

      if (!resp.ok) {
        captureEvent('resume_parse_error', { status: resp.status, error: json?.error });
        rbShowError('rb-upload-error', json?.error || 'Parsing failed. Please try again.');
        return;
      }

      _state.resumeId = json.resume_id;
      _state.parsedJson = json.parsed_json;

      // Show ATS warnings
      if (json.ats_warnings?.length) {
        rbShowAtsWarnings(json.ats_warnings);
      }

      // Populate editor
      rbPopulateEditor(_state.parsedJson, label);
      rbShowEditor();

      captureEvent('resume_parsed', { resume_id: _state.resumeId, has_warnings: (json.ats_warnings?.length ?? 0) > 0 });
      if (typeof showToast === 'function') showToast('Resume parsed successfully', 'success');

    } catch (err) {
      reportError('resume_parse_exception', err);
      rbShowError('rb-upload-error', 'An unexpected error occurred. Please try again.');
    } finally {
      rbSetParsing(false);
    }
  };

  // ─── Blank scratch editor ─────────────────────────────────────────────────

  function rbLoadBlankEditor (label) {
    _state.parsedJson = {
      contact_info: { name: '', email: '', phone: '', linkedin: '', location: '', website: '' },
      summary: '',
      work_experience: [],
      education: [],
      skills: [],
      certifications: [],
      languages: [],
      projects: [],
    };
    rbPopulateEditor(_state.parsedJson, label);
    rbShowEditor();
  }

  // ─── Populate editor fields from parsed JSON ──────────────────────────────

  function rbPopulateEditor (data, label) {
    // Contact
    const ci = data.contact_info || {};
    rbSetVal('rb-f-name', ci.name);
    rbSetVal('rb-f-email', ci.email);
    rbSetVal('rb-f-phone', ci.phone);
    rbSetVal('rb-f-linkedin', ci.linkedin);
    rbSetVal('rb-f-location', ci.location);
    rbSetVal('rb-f-website', ci.website);

    // Summary
    rbSetVal('rb-f-summary', data.summary);

    // Skills
    const skills = Array.isArray(data.skills) ? data.skills.join(', ') : (data.skills || '');
    rbSetVal('rb-f-skills', skills);

    // Label
    if (label) rbSetVal('rb-label-input', label);

    // Experience
    rbRenderExperience(data.work_experience || []);

    // Education
    rbRenderEducation(data.education || []);

    // Certs
    rbRenderCerts(data.certifications || []);

    _state.dirty = false;
  }

  // ─── Experience render ────────────────────────────────────────────────────

  function rbRenderExperience (items) {
    const list = document.getElementById('rb-experience-list');
    if (!list) return;
    list.innerHTML = items.map((job, i) => `
      <div class="rb-exp-item" data-idx="${i}">
        <div class="rb-exp-header">
          <span class="rb-exp-title">${rbEsc(job.title || '')} &mdash; ${rbEsc(job.company || '')}</span>
          <button class="rb-remove-btn" onclick="rbRemoveExperience(${i})" aria-label="Remove position">&times;</button>
        </div>
        <div class="rb-field-grid">
          <div class="rb-field"><label class="rb-label">Job Title</label><input type="text" class="rb-input rb-exp-field" data-idx="${i}" data-key="title" value="${rbEsc(job.title || '')}"></div>
          <div class="rb-field"><label class="rb-label">Company</label><input type="text" class="rb-input rb-exp-field" data-idx="${i}" data-key="company" value="${rbEsc(job.company || '')}"></div>
          <div class="rb-field"><label class="rb-label">Start Date</label><input type="text" class="rb-input rb-exp-field" data-idx="${i}" data-key="start_date" placeholder="MM/YYYY" value="${rbEsc(job.start_date || '')}"></div>
          <div class="rb-field"><label class="rb-label">End Date</label><input type="text" class="rb-input rb-exp-field" data-idx="${i}" data-key="end_date" placeholder="MM/YYYY or Present" value="${rbEsc(job.end_date || '')}"></div>
          <div class="rb-field"><label class="rb-label">Location</label><input type="text" class="rb-input rb-exp-field" data-idx="${i}" data-key="location" value="${rbEsc(job.location || '')}"></div>
        </div>
        <div class="rb-field">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <label class="rb-label" style="margin-bottom:0;">Bullet Points <span class="rb-label-hint">(one per line)</span></label>
            <button class="rb-improve-btn" onclick="rbImproveBullets(${i})" id="rb-improve-btn-${i}">✦ Improve with AI</button>
          </div>
          <textarea class="rb-textarea rb-exp-field" rows="4" data-idx="${i}" data-key="bullets" id="rb-bullets-${i}">${rbEsc((job.bullets || []).join('\n'))}</textarea>
          <div id="rb-rewrite-panel-${i}" class="rb-rewrite-panel u-hidden"></div>
        </div>
      </div>
    `).join('');
    bindExpFieldChanges();
  }

  function bindExpFieldChanges () {
    document.querySelectorAll('.rb-exp-field').forEach(el => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.idx);
        const key = el.dataset.key;
        if (!_state.parsedJson.work_experience[idx]) return;
        if (key === 'bullets') {
          _state.parsedJson.work_experience[idx].bullets = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        } else {
          _state.parsedJson.work_experience[idx][key] = el.value;
        }
        _state.dirty = true;
      });
    });
  }

  window.rbAddExperience = function () {
    if (!_state.parsedJson) return;
    _state.parsedJson.work_experience = _state.parsedJson.work_experience || [];
    _state.parsedJson.work_experience.push({ company: '', title: '', start_date: '', end_date: 'Present', location: '', bullets: [] });
    rbRenderExperience(_state.parsedJson.work_experience);
    _state.dirty = true;
  };

  window.rbRemoveExperience = function (idx) {
    _state.parsedJson.work_experience.splice(idx, 1);
    rbRenderExperience(_state.parsedJson.work_experience);
    _state.dirty = true;
  };

  // ─── Education render ─────────────────────────────────────────────────────

  function rbRenderEducation (items) {
    const list = document.getElementById('rb-education-list');
    if (!list) return;
    list.innerHTML = items.map((edu, i) => `
      <div class="rb-edu-item" data-idx="${i}">
        <div class="rb-exp-header">
          <span class="rb-exp-title">${rbEsc(edu.institution || '')}</span>
          <button class="rb-remove-btn" onclick="rbRemoveEducation(${i})" aria-label="Remove education">&times;</button>
        </div>
        <div class="rb-field-grid">
          <div class="rb-field"><label class="rb-label">Institution</label><input type="text" class="rb-input rb-edu-field" data-idx="${i}" data-key="institution" value="${rbEsc(edu.institution || '')}"></div>
          <div class="rb-field"><label class="rb-label">Degree</label><input type="text" class="rb-input rb-edu-field" data-idx="${i}" data-key="degree" value="${rbEsc(edu.degree || '')}"></div>
          <div class="rb-field"><label class="rb-label">Field of Study</label><input type="text" class="rb-input rb-edu-field" data-idx="${i}" data-key="field" value="${rbEsc(edu.field || '')}"></div>
          <div class="rb-field"><label class="rb-label">Graduation Date</label><input type="text" class="rb-input rb-edu-field" data-idx="${i}" data-key="graduation_date" placeholder="MM/YYYY" value="${rbEsc(edu.graduation_date || '')}"></div>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('.rb-edu-field').forEach(el => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.idx);
        const key = el.dataset.key;
        if (_state.parsedJson.education[idx]) {
          _state.parsedJson.education[idx][key] = el.value;
          _state.dirty = true;
        }
      });
    });
  }

  window.rbAddEducation = function () {
    if (!_state.parsedJson) return;
    _state.parsedJson.education = _state.parsedJson.education || [];
    _state.parsedJson.education.push({ institution: '', degree: '', field: '', graduation_date: '' });
    rbRenderEducation(_state.parsedJson.education);
    _state.dirty = true;
  };

  window.rbRemoveEducation = function (idx) {
    _state.parsedJson.education.splice(idx, 1);
    rbRenderEducation(_state.parsedJson.education);
    _state.dirty = true;
  };

  // ─── Certs render ─────────────────────────────────────────────────────────

  function rbRenderCerts (items) {
    const list = document.getElementById('rb-certs-list');
    if (!list) return;
    list.innerHTML = items.map((cert, i) => `
      <div class="rb-cert-item" data-idx="${i}">
        <div class="rb-exp-header">
          <span class="rb-exp-title">${rbEsc(cert.name || '')}</span>
          <button class="rb-remove-btn" onclick="rbRemoveCert(${i})" aria-label="Remove certification">&times;</button>
        </div>
        <div class="rb-field-grid">
          <div class="rb-field"><label class="rb-label">Certification Name</label><input type="text" class="rb-input rb-cert-field" data-idx="${i}" data-key="name" value="${rbEsc(cert.name || '')}"></div>
          <div class="rb-field"><label class="rb-label">Issuing Body</label><input type="text" class="rb-input rb-cert-field" data-idx="${i}" data-key="issuer" value="${rbEsc(cert.issuer || '')}"></div>
          <div class="rb-field"><label class="rb-label">Date</label><input type="text" class="rb-input rb-cert-field" data-idx="${i}" data-key="date" placeholder="MM/YYYY" value="${rbEsc(cert.date || '')}"></div>
        </div>
      </div>
    `).join('');
    document.querySelectorAll('.rb-cert-field').forEach(el => {
      el.addEventListener('input', () => {
        const idx = parseInt(el.dataset.idx);
        const key = el.dataset.key;
        if (_state.parsedJson.certifications[idx]) {
          _state.parsedJson.certifications[idx][key] = el.value;
          _state.dirty = true;
        }
      });
    });
  }

  window.rbAddCert = function () {
    if (!_state.parsedJson) return;
    _state.parsedJson.certifications = _state.parsedJson.certifications || [];
    _state.parsedJson.certifications.push({ name: '', issuer: '', date: '' });
    rbRenderCerts(_state.parsedJson.certifications);
    _state.dirty = true;
  };

  window.rbRemoveCert = function (idx) {
    _state.parsedJson.certifications.splice(idx, 1);
    rbRenderCerts(_state.parsedJson.certifications);
    _state.dirty = true;
  };

  // ─── Save edits ───────────────────────────────────────────────────────────

  window.rbSaveEdits = async function () {
    if (!_state.parsedJson) return;
    rbClearError('rb-editor-error');

    // Collect contact
    _state.parsedJson.contact_info = {
      name: rbGetVal('rb-f-name'),
      email: rbGetVal('rb-f-email'),
      phone: rbGetVal('rb-f-phone'),
      linkedin: rbGetVal('rb-f-linkedin'),
      location: rbGetVal('rb-f-location'),
      website: rbGetVal('rb-f-website'),
    };
    _state.parsedJson.summary = rbGetVal('rb-f-summary');

    // Skills — accept comma or newline separated
    const skillsRaw = rbGetVal('rb-f-skills');
    _state.parsedJson.skills = skillsRaw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

    const label = rbGetVal('rb-label-input') || 'My Resume';

    const saveBtn = document.getElementById('rb-save-btn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const body = {
        paste_text: JSON.stringify(_state.parsedJson), // reuse parse EF to update row
        label,
        resume_id: _state.resumeId,
      };

      // For updates, call parse EF with resume_id to upsert parsed_json directly
      const resp = await fetch('/api/resume-parse', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await resp.json();

      if (!resp.ok) {
        reportError('resume_save_error', new Error(json?.error));
        rbShowError('rb-editor-error', json?.error || 'Save failed. Please try again.');
        return;
      }

      _state.resumeId = json.resume_id;
      _state.dirty = false;
      document.getElementById('rb-saved-badge')?.classList.remove('u-hidden');
      captureEvent('resume_saved', { resume_id: _state.resumeId });
      if (typeof showToast === 'function') showToast('Resume saved', 'success');

    } catch (err) {
      reportError('resume_save_exception', err);
      rbShowError('rb-editor-error', 'An unexpected error occurred. Please try again.');
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  };

  // ─── Reset ────────────────────────────────────────────────────────────────

  window.rbReset = function () {
    _state = { mode: 'upload', editorTab: 'contact', file: null, resumeId: null, parsedJson: null, dirty: false, template: 'modern' };
    rbClearFile();
    document.getElementById('rb-paste-area') && (document.getElementById('rb-paste-area').value = '');
    document.getElementById('rb-label-input') && (document.getElementById('rb-label-input').value = '');
    document.getElementById('rb-upload-section')?.classList.remove('u-hidden');
    document.getElementById('rb-editor-section')?.classList.add('u-hidden');
    document.getElementById('rb-ats-warnings')?.classList.add('u-hidden');
    document.getElementById('rb-parsing')?.classList.add('u-hidden');
    document.getElementById('rb-saved-badge')?.classList.add('u-hidden');
    document.getElementById('rb-generate-section')?.classList.add('u-hidden');
    document.getElementById('rb-download-links')?.classList.add('u-hidden');
    _state.template = 'modern';
    rbSwitchTab('upload');
  };

  // ─── UI helpers ───────────────────────────────────────────────────────────

  function rbSetParsing (active) {
    document.getElementById('rb-upload-section')?.classList.toggle('u-hidden', active);
    document.getElementById('rb-parsing')?.classList.toggle('u-hidden', !active);
    const btn = document.getElementById('rb-parse-btn');
    if (btn) { btn.disabled = active; }
  }

  function rbShowEditor () {
    document.getElementById('rb-upload-section')?.classList.add('u-hidden');
    document.getElementById('rb-parsing')?.classList.add('u-hidden');
    document.getElementById('rb-editor-section')?.classList.remove('u-hidden');
    rbShowEditorTab('contact');
    rbShowGenerateSection();
  }

  function rbShowAtsWarnings (warnings) {
    const box = document.getElementById('rb-ats-warnings');
    const list = document.getElementById('rb-warnings-list');
    if (!box || !list) return;
    list.innerHTML = warnings.map(w => `<li>${rbEsc(w)}</li>`).join('');
    box.classList.remove('u-hidden');
  }

  function rbShowError (id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('u-hidden');
  }

  function rbClearError (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.classList.add('u-hidden');
  }

  function rbSetVal (id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }

  function rbGetVal (id) {
    return (document.getElementById(id)?.value ?? '').trim();
  }

  function rbEsc (str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── S2: Template selection ──────────────────────────────────────────────────

  window.rbSelectTemplate = function (tpl) {
    _state.template = tpl;
    document.querySelectorAll('.rb-template-card').forEach(c => {
      c.classList.toggle('active', c.id === `rb-tpl-${tpl}`);
    });
  };

  // ─── S2: Show generate card once editor is visible ───────────────────────────

  function rbShowGenerateSection () {
    const sec = document.getElementById('rb-generate-section');
    if (sec) sec.classList.remove('u-hidden');
  }

  // ─── S2: Generate (call EF, then show download links) ────────────────────────

  window.rbGenerate = async function () {
    if (!_state.resumeId) {
      rbShowError('rb-generate-error', 'Save your resume first before generating.');
      return;
    }
    rbClearError('rb-generate-error');
    rbSetGenerating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch('/api/resume-generate', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resume_id: _state.resumeId,
          template_id: _state.template || 'modern',
        }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        captureEvent('resume_generate_error', { status: resp.status, error: json?.error });
        rbShowError('rb-generate-error', json?.error || 'Generation failed. Please try again.');
        return;
      }

      // Show download links
      rbShowDownloadLinks(json.docx_url, json.pdf_url, json.filename);
      captureEvent('resume_generated', { resume_id: _state.resumeId, template: _state.template });
      if (typeof showToast === 'function') showToast('Resume generated — ready to download', 'success');

    } catch (err) {
      reportError('resume_generate_exception', err);
      rbShowError('rb-generate-error', 'An unexpected error occurred. Please try again.');
    } finally {
      rbSetGenerating(false);
    }
  };

  function rbSetGenerating (active) {
    const btn = document.getElementById('rb-generate-btn');
    const spinner = document.getElementById('rb-generating');
    const links = document.getElementById('rb-download-links');
    if (btn) { btn.disabled = active; btn.textContent = active ? 'Generating…' : 'Generate Resume'; }
    if (spinner) spinner.classList.toggle('u-hidden', !active);
    if (active && links) links.classList.add('u-hidden');
  }

  function rbShowDownloadLinks (docxUrl, pdfUrl, filename) {
    const linksEl = document.getElementById('rb-download-links');
    const docxEl  = document.getElementById('rb-dl-docx');
    const pdfEl   = document.getElementById('rb-dl-pdf');
    if (!linksEl || !docxEl) return;

    if (docxUrl) {
      docxEl.href = docxUrl;
      docxEl.setAttribute('download', filename || 'Resume.docx');
      docxEl.classList.remove('u-hidden');
    }
    if (pdfUrl && pdfEl) {
      pdfEl.href = pdfUrl;
      pdfEl.setAttribute('download', (filename || 'Resume').replace('.docx', '.pdf'));
      pdfEl.classList.remove('u-hidden');
    }
    linksEl.classList.remove('u-hidden');
  }

  // ─── S3: Optimize + Gap Report ───────────────────────────────────────────────

  // Called when page opens — load pipeline jobs into the selector
  window.rbLoadJobSelector = async function () {
    const sel = document.getElementById('rb-job-select');
    if (!sel) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      // Load pipeline jobs (saved jobs)
      const { data: rows } = await supabase
        .from('pipeline')
        .select('job_id, ats_jobs(greenhouse_id, title, company_name)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!rows?.length) {
        sel.innerHTML = '<option value="">— Save jobs to your Pipeline first —</option>';
        return;
      }
      sel.innerHTML = '<option value="">— Select a saved job —</option>' +
        rows.map(r => {
          const j = r.ats_jobs;
          if (!j) return '';
          const label = `${j.title || 'Untitled'} — ${j.company_name || ''}`;
          return `<option value="${rbEsc(j.greenhouse_id)}">${rbEsc(label)}</option>`;
        }).filter(Boolean).join('');
    } catch (err) {
      reportError('resume_builder_job_selector', err);
    }
  };

  window.rbOptimize = async function () {
    rbClearError('rb-optimize-error');
    const sel = document.getElementById('rb-job-select');
    const jobId = sel?.value?.trim();

    if (!jobId) {
      rbShowError('rb-optimize-error', 'Select a job to optimize against.');
      return;
    }
    if (!_state.resumeId) {
      rbShowError('rb-optimize-error', 'Save your resume first.');
      return;
    }

    rbSetOptimizing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch('/api/resume-optimize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resume_id: _state.resumeId, target_job_id: jobId }),
      });

      const json = await resp.json();

      if (!resp.ok) {
        captureEvent('resume_optimize_error', { status: resp.status, error: json?.error });
        rbShowError('rb-optimize-error', json?.error || 'Analysis failed. Please try again.');
        return;
      }

      rbRenderGapReport(json);
      captureEvent('resume_optimized', {
        resume_id: _state.resumeId,
        job_id: jobId,
        match_score: json.match_score,
        total_keywords: json.keyword_gaps?.length ?? 0,
      });

    } catch (err) {
      reportError('resume_optimize_exception', err);
      rbShowError('rb-optimize-error', 'An unexpected error occurred. Please try again.');
    } finally {
      rbSetOptimizing(false);
    }
  };

  // Called from job feed: "Optimize Resume" button on job cards
  window.rbOpenOptimizeForJob = function (jobId) {
    if (typeof showPage === 'function') showPage('resume-builder');
    // Wait for page to be visible, then pre-select the job
    setTimeout(function () {
      const sel = document.getElementById('rb-job-select');
      if (sel) {
        // Try to set value; if option not loaded yet, rbLoadJobSelector will populate
        sel.value = jobId;
        if (!sel.value) {
          // Populate selector then set
          rbLoadJobSelector().then(function () { sel.value = jobId; });
        }
      }
      const sec = document.getElementById('rb-optimize-section');
      if (sec) {
        sec.classList.remove('u-hidden');
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 300);
  };

  function rbRenderGapReport (data) {
    const report = document.getElementById('rb-gap-report');
    if (!report) return;

    // Score circle
    const score = data.match_score ?? 0;
    const circle = document.getElementById('rb-score-circle');
    const scoreNum = document.getElementById('rb-score-num');
    const scoreTarget = document.getElementById('rb-score-target');
    if (circle) {
      const color = score >= 70 ? '#16a34a' : score >= 45 ? '#d97706' : '#ef4444';
      circle.style.setProperty('--score-pct', String(score));
      circle.style.setProperty('--score-color', color);
    }
    if (scoreNum) scoreNum.textContent = `${score}%`;
    if (scoreTarget) scoreTarget.textContent = `vs. ${data.job_title || 'target job'} at ${data.company_name || ''}`;

    // Pills by category
    const pillsEl = document.getElementById('rb-gap-pills');
    if (pillsEl) {
      const byCategory = {};
      for (const g of (data.keyword_gaps || [])) {
        const cat = g.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(g);
      }
      const catLabels = {
        skill: 'Skills & Tools', education: 'Education', title: 'Job Title',
        certification: 'Certifications', soft_skill: 'Soft Skills',
        experience: 'Experience', location: 'Location',
      };
      let html = '';
      for (const [cat, gaps] of Object.entries(byCategory)) {
        if (!gaps.length) continue;
        html += `<div class="rb-gap-section">
          <div class="rb-gap-section-title">${rbEsc(catLabels[cat] || cat)}</div>
          <div>`;
        for (const g of gaps) {
          const icon = g.status === 'present' ? '✓' : g.status === 'partial' ? '~' : '+';
          const title = g.status === 'missing' && g.suggestion
            ? `title="${rbEsc(g.suggestion)}" onclick="rbInsertKeyword(${JSON.stringify(rbEsc(g.keyword))}, '${g.category}')"`
            : '';
          html += `<span class="rb-gap-pill ${g.status}" ${title}><span class="rb-gap-pill-icon">${icon}</span>${rbEsc(g.keyword)}</span>`;
        }
        html += '</div></div>';
      }
      pillsEl.innerHTML = html;
    }

    // Suggestions list
    const sugSec = document.getElementById('rb-suggestions-section');
    const sugList = document.getElementById('rb-suggestions-list');
    if (data.suggestions?.length && sugSec && sugList) {
      sugList.innerHTML = data.suggestions.slice(0, 8).map(s => `<li>${rbEsc(s)}</li>`).join('');
      sugSec.classList.remove('u-hidden');
    }

    report.classList.remove('u-hidden');
  }

  // One-click keyword insertion into parsed_json
  window.rbInsertKeyword = function (keyword, category) {
    if (!_state.parsedJson) return;
    const kw = String(keyword).trim();
    if (!kw) return;

    if (category === 'skill' || category === 'tool') {
      _state.parsedJson.skills = _state.parsedJson.skills || [];
      if (!_state.parsedJson.skills.includes(kw)) {
        _state.parsedJson.skills.push(kw);
        // Update the skills textarea
        const ta = document.getElementById('rb-f-skills');
        if (ta) ta.value = _state.parsedJson.skills.join(', ');
        _state.dirty = true;
        if (typeof showToast === 'function') showToast(`"${kw}" added to Skills`, 'success');
        captureEvent('resume_keyword_inserted', { keyword: kw, category });
      }
    } else if (category === 'certification') {
      _state.parsedJson.certifications = _state.parsedJson.certifications || [];
      _state.parsedJson.certifications.push({ name: kw, issuer: '', date: '' });
      rbRenderCerts(_state.parsedJson.certifications);
      _state.dirty = true;
      if (typeof showToast === 'function') showToast(`"${kw}" added to Certifications`, 'success');
      captureEvent('resume_keyword_inserted', { keyword: kw, category });
    }
    // For other categories — show a hint to add manually
    else {
      if (typeof showToast === 'function') showToast(`Add "${kw}" to your ${category === 'title' ? 'Summary' : category} section`, 'info');
    }
  };

  function rbSetOptimizing (active) {
    const btn = document.getElementById('rb-optimize-btn');
    const spinner = document.getElementById('rb-optimizing');
    const report = document.getElementById('rb-gap-report');
    if (btn) { btn.disabled = active; btn.textContent = active ? 'Analyzing…' : 'Analyze'; }
    if (spinner) spinner.classList.toggle('u-hidden', !active);
    if (active && report) report.classList.add('u-hidden');
  }

  // ─── S4: AI Bullet Rewrites ──────────────────────────────────────────────────

  window.rbImproveBullets = async function (jobIdx) {
    if (!_state.parsedJson || !_state.resumeId) {
      if (typeof showToast === 'function') showToast('Save your resume first', 'warning');
      return;
    }

    const job = _state.parsedJson.work_experience?.[jobIdx];
    if (!job) return;

    const ta = document.getElementById(`rb-bullets-${jobIdx}`);
    const bullets = (ta?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
    if (bullets.length === 0) {
      if (typeof showToast === 'function') showToast('Add at least one bullet point first', 'warning');
      return;
    }

    const panel = document.getElementById(`rb-rewrite-panel-${jobIdx}`);
    const btn = document.getElementById(`rb-improve-btn-${jobIdx}`);
    if (!panel) return;

    // Gather target keywords from gap report if available, else from skills
    const skills = _state.parsedJson.skills || [];
    const targetKeywords = skills.slice(0, 10);

    const jobContext = [job.title, job.company].filter(Boolean).join(' at ');

    panel.classList.remove('u-hidden');
    panel.innerHTML = `<div class="rb-rewrite-loading"><div class="rb-generate-spinner"></div>Generating rewrites for ${bullets.length} bullet${bullets.length > 1 ? 's' : ''}…</div>`;
    if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Rewrite all bullets — one request per bullet (max 3 bullets to limit credit spend)
      const bulletsToRewrite = bullets.slice(0, 3);
      const results = await Promise.allSettled(
        bulletsToRewrite.map(bullet =>
          fetch('/api/resume-rewrite-bullet', {
            method: 'POST',
            headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ resume_id: _state.resumeId, bullet, target_keywords: targetKeywords, job_context: jobContext }),
          }).then(r => r.json())
        )
      );

      let html = `<div class="rb-rewrite-panel-title">✦ AI Rewrites — click Accept to replace</div>`;
      let anySuccess = false;

      results.forEach((result, idx) => {
        const originalBullet = bulletsToRewrite[idx];
        if (result.status === 'fulfilled' && result.value.alternatives?.length) {
          anySuccess = true;
          html += `<div style="margin-bottom:14px;"><div style="font-size:11px;color:var(--text-faint);margin-bottom:6px;font-style:italic;">Original: ${rbEsc(originalBullet)}</div>`;
          result.value.alternatives.forEach((alt, altIdx) => {
            html += `<div class="rb-rewrite-option">
              <span class="rb-rewrite-text">${rbEsc(alt)}</span>
              <button class="rb-rewrite-accept" data-accept-idx="1" data-job-idx="${jobIdx}" data-bullet-idx="${idx}" data-alt="${rbEsc(alt)}">Accept</button>
            </div>`;
          });
          html += `</div>`;
        } else {
          const errMsg = result.status === 'fulfilled' ? (result.value.error || 'Failed') : 'Network error';
          html += `<div class="rb-rewrite-error">Bullet ${idx + 1}: ${rbEsc(errMsg)}</div>`;
        }
      });

      if (bullets.length > 3) {
        html += `<div style="font-size:11px;color:var(--text-faint);margin-top:8px;">Showing rewrites for first 3 bullets (${bullets.length - 3} more not shown).</div>`;
      }

      html += '<div style="text-align:right;margin-top:12px;"><button class="btn btn-sm btn-outline" data-dismiss-panel="' + jobIdx + '">Dismiss</button></div>';
      panel.innerHTML = html;
      // Bind dismiss buttons
      panel.querySelectorAll('[data-dismiss-panel]').forEach(function(b) {
        b.addEventListener('click', function() { panel.classList.add('u-hidden'); });
      });
      // Bind accept buttons
      panel.querySelectorAll('[data-accept-idx]').forEach(function(b) {
        b.addEventListener('click', function() {
          rbAcceptRewrite(parseInt(b.dataset.jobIdx), parseInt(b.dataset.bulletIdx), b.dataset.alt);
        });
      });

      if (anySuccess) {
        captureEvent('resume_bullets_rewritten', { job_idx: jobIdx, bullet_count: bulletsToRewrite.length });
      }

    } catch (err) {
      reportError('resume_rewrite_exception', err);
      panel.innerHTML = '<div class="rb-rewrite-error">An unexpected error occurred. Please try again.</div>' +
        '<div style="text-align:right;margin-top:8px;"><button class="btn btn-sm btn-outline" data-dismiss-panel="' + jobIdx + '">Dismiss</button></div>';
      panel.querySelectorAll('[data-dismiss-panel]').forEach(function(b) {
        b.addEventListener('click', function() { panel.classList.add('u-hidden'); });
      });
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✦ Improve with AI'; }
    }
  };

  // Accept a single rewrite — replaces that bullet in the textarea
  window.rbAcceptRewrite = function (jobIdx, bulletIdx, newText) {
    const ta = document.getElementById(`rb-bullets-${jobIdx}`);
    if (!ta) return;
    const bullets = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
    if (bulletIdx < bullets.length) {
      bullets[bulletIdx] = newText;
    } else {
      bullets.push(newText);
    }
    ta.value = bullets.join('\n');
    // Sync to parsedJson
    if (_state.parsedJson?.work_experience?.[jobIdx]) {
      _state.parsedJson.work_experience[jobIdx].bullets = bullets;
      _state.dirty = true;
    }
    if (typeof showToast === 'function') showToast('Bullet updated', 'success');
    captureEvent('resume_rewrite_accepted', { job_idx: jobIdx, bullet_idx: bulletIdx });
    // Collapse the panel
    document.getElementById(`rb-rewrite-panel-${jobIdx}`)?.classList.add('u-hidden');
  };

  // ─── Page init hook (called by showPage in app.js) ────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    // Bind dirty check on unload
    window.addEventListener('beforeunload', (e) => {
      if (_state.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  });

})();
