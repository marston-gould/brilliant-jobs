// @ts-nocheck
// js/cover-letter.js — AIS-F8-S1: Cover Letter Generator UI
// ===========================================================

(function () {
  'use strict';

  var _clJobId = null;
  var _clJobTitle = null;
  var _clCompany = null;
  var _clTone = 'professional';
  var _clCoverId = null;
  var _clVersion = 1;
  var _clHistory = [];

  // ── Open panel ────────────────────────────────────────────────────────────
  window.openCoverLetterPanel = function (jobId, jobTitle, company) {
    _clJobId = jobId || null;
    _clJobTitle = jobTitle || '';
    _clCompany = company || '';
    _clTone = 'professional';
    _clCoverId = null;
    _clVersion = 1;
    _clHistory = [];

    var titleEl = document.getElementById('cl-panel-title');
    var subtitleEl = document.getElementById('cl-panel-subtitle');
    if (titleEl) titleEl.textContent = 'Cover Letter';
    if (subtitleEl) subtitleEl.textContent = (_clJobTitle ? _clJobTitle : '') + (_clCompany ? ' @ ' + _clCompany : '');

    var panel = document.getElementById('cl-panel');
    var backdrop = document.getElementById('cl-backdrop');
    if (panel) { panel.style.display = 'flex'; panel.classList.remove('u-hidden'); }
    if (backdrop) backdrop.style.display = 'block';

    // Reset tone buttons
    document.querySelectorAll('.cl-tone-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tone') === _clTone;
      btn.style.background = active ? 'var(--accent)' : 'transparent';
      btn.style.color = active ? '#fff' : 'var(--text)';
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    });

    // Load existing or generate new
    _clLoadHistory().then(function () {
      if (_clHistory.length) {
        _clShowVersion(_clHistory[0]);
      } else {
        _clGenerate();
      }
    });

    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  };

  window._clClose = function () {
    var panel = document.getElementById('cl-panel');
    var backdrop = document.getElementById('cl-backdrop');
    if (panel) { panel.style.display = 'none'; panel.classList.add('u-hidden'); }
    if (backdrop) backdrop.style.display = 'none';
  };

  window._clSetTone = function (tone) {
    _clTone = tone;
    document.querySelectorAll('.cl-tone-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tone') === tone;
      btn.style.background = active ? 'var(--accent)' : 'transparent';
      btn.style.color = active ? '#fff' : 'var(--text)';
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    });
    _clGenerate();
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  window._clGenerate = async function () {
    var gen = document.getElementById('cl-generating');
    var content = document.getElementById('cl-content');
    var meta = document.getElementById('cl-meta');
    if (gen) gen.style.display = 'block';
    if (content) { content.style.display = 'none'; content.value = ''; }
    if (meta) meta.style.display = 'none';

    try {
      var token = typeof _getAuthToken === 'function' ? await _getAuthToken() : (window._bjSupabaseSession && window._bjSupabaseSession.access_token);

      // Get resume text
      var resumeText = '';
      if (typeof _getActiveResume === 'function') {
        var res = _getActiveResume();
        if (res && res.text) resumeText = res.text;
      }
      if (!resumeText) {
        try {
          var raw = localStorage.getItem('bj_resumes');
          var resumes = raw ? JSON.parse(raw) : [];
          var active = resumes.find(function (r) { return r.is_active || r.isActive; }) || resumes[0];
          if (active) resumeText = active.extractedText || active.text || '';
        } catch (e) { if (typeof reportError === 'function') reportError('cover-letter:resume-fetch', e); }
      }

      // Get JD from pipeline entry if jobId present
      var jd = '';
      if (_clJobId && typeof sb !== 'undefined') {
        try {
          var jdRes = await sb.from('ats_jobs').select('description,title').eq('id', _clJobId).maybeSingle();
          if (jdRes.data) {
            jd = (jdRes.data.description || '').replace(/<[^>]+>/g, ' ').slice(0, 4000);
          }
        } catch (e) { if (typeof reportError === 'function') reportError('cover-letter:jd-fetch', e); }
      }

      var resp = await fetch('https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/generate-cover-letter', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: resumeText || 'No resume text available.',
          jobDescription: jd || _clJobTitle || 'General application',
          jobTitle: _clJobTitle,
          companyName: _clCompany,
          tone: _clTone,
          jobId: _clJobId,
        }),
      });

      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Generation failed');

      _clCoverId = data.cover_letter_id;
      _clVersion = data.version || 1;

      if (gen) gen.style.display = 'none';
      if (content) { content.style.display = 'block'; content.value = data.letter || ''; }
      if (meta) {
        meta.style.display = 'block';
        meta.textContent = 'v' + _clVersion + ' · ' + _clTone + ' · ' + (data.word_count || '') + ' words · 2 credits';
      }

      // PostHog
      if (typeof capturePostHog === 'function') {
        capturePostHog('cover_letter_generated', {
          job_id: _clJobId || '',
          tone: _clTone,
          version: _clVersion,
          credits_charged: 2,
        });
      }

      await _clLoadHistory();

    } catch (e) {
      reportError('cover-letter:_clGenerate', e);
      if (gen) gen.style.display = 'none';
      if (content) { content.style.display = 'block'; content.value = ''; }
      if (typeof showToast === 'function') showToast('Cover letter generation failed. Please try again.', { type: 'error' });
    }
  };

  // ── History ───────────────────────────────────────────────────────────────
  async function _clLoadHistory() {
    if (!_clJobId || typeof sb === 'undefined' || !currentUser) return;
    try {
      var res = await sb.from('cover_letters')
        .select('id,tone,version,created_at,word_count')
        .eq('user_id', currentUser.id)
        .eq('job_id', _clJobId)
        .order('created_at', { ascending: false })
        .limit(10);
      _clHistory = res.data || [];
      _clRenderHistory();
    } catch (e) { if (typeof reportError === 'function') reportError('cover-letter:history', e); }
  }

  function _clRenderHistory() {
    var histEl = document.getElementById('cl-history');
    var listEl = document.getElementById('cl-history-list');
    if (!listEl) return;
    if (!_clHistory.length) { if (histEl) histEl.style.display = 'none'; return; }
    if (histEl) histEl.style.display = 'block';
    listEl.innerHTML = _clHistory.map(function (h) {
      var date = new Date(h.created_at).toLocaleDateString();
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--bg);border-radius:6px;cursor:pointer;" onclick="window._clLoadVersion(\'' + h.id + '\')">' +
        '<span style="font-size:11px;color:var(--text);">v' + h.version + ' · ' + h.tone + ' · ' + date + '</span>' +
        '<span style="font-size:10px;color:var(--text-muted);">' + (h.word_count || '') + ' words</span>' +
      '</div>';
    }).join('');
  }

  window._clLoadVersion = async function (id) {
    if (typeof sb === 'undefined') return;
    try {
      var res = await sb.from('cover_letters').select('content,tone,version,word_count').eq('id', id).single();
      if (res.data) _clShowVersion(res.data);
    } catch (e) { reportError('cover-letter:_clLoadVersion', e); }
  };

  function _clShowVersion(row) {
    var content = document.getElementById('cl-content');
    var meta = document.getElementById('cl-meta');
    var gen = document.getElementById('cl-generating');
    if (gen) gen.style.display = 'none';
    if (content) { content.style.display = 'block'; content.value = row.content || ''; }
    if (meta) {
      meta.style.display = 'block';
      meta.textContent = 'v' + (row.version || 1) + ' · ' + (row.tone || '') + ' · ' + (row.word_count || '') + ' words';
    }
    _clTone = row.tone || 'professional';
    _clVersion = row.version || 1;
    document.querySelectorAll('.cl-tone-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tone') === _clTone;
      btn.style.background = active ? 'var(--accent)' : 'transparent';
      btn.style.color = active ? '#fff' : 'var(--text)';
      btn.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  window._clCopyToClipboard = function () {
    var content = document.getElementById('cl-content');
    if (!content || !content.value) return;
    navigator.clipboard.writeText(content.value).then(function () {
      if (typeof showToast === 'function') showToast('Cover letter copied!', { type: 'success' });
    }).catch(function () {
      content.select();
      document.execCommand('copy');
      if (typeof showToast === 'function') showToast('Cover letter copied!');
    });
  };

  // AIS-F8-S1: DOCX export — generates simple DOCX blob
  window._clExportDocx = function () {
    var content = document.getElementById('cl-content');
    if (!content || !content.value) return;
    var text = content.value;
    var filename = (_clCompany ? _clCompany.replace(/[^a-zA-Z0-9]/g, '-') : 'cover-letter') + '-v' + _clVersion + '.docx';

    // Simple DOCX generation using minimal OOXML
    var paragraphs = text.split('\n').map(function (line) {
      return '<w:p><w:r><w:t xml:space="preserve">' + line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</w:t></w:r></w:p>';
    }).join('');

    var docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + paragraphs + '</w:body></w:document>';

    var relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

    var contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';

    // Use JSZip if available, else fall back to plain text download
    if (typeof JSZip !== 'undefined') {
      var zip = new JSZip();
      zip.file('[Content_Types].xml', contentTypes);
      zip.file('_rels/.rels', relsXml);
      zip.file('word/document.xml', docXml);
      zip.generateAsync({ type: 'blob' }).then(function (blob) {
        _clDownload(blob, filename, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      }).catch(function (e) { reportError('cover-letter:_clExportDocx', e); });
    } else {
      // Fallback: plain text download
      var blob = new Blob([text], { type: 'text/plain' });
      _clDownload(blob, filename.replace('.docx', '.txt'), 'text/plain');
      if (typeof showToast === 'function') showToast('Downloaded as .txt (DOCX library not loaded).');
    }
  };

  function _clDownload(blob, name, type) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // Export
  window.BJ = window.BJ || {};
  window.BJ.openCoverLetterPanel = window.openCoverLetterPanel;
  window.BJ._registry = window.BJ._registry || {};
  window.BJ._registry.openCoverLetterPanel = { module: 'cover-letter', registered: Date.now() };
})();
