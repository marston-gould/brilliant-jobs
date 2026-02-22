// ============================================================
// RESUMES
// ============================================================
resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');

function saveResumes() {
  saveUserData('bj_resumes', JSON.stringify(resumes));
}

function getFileIcon(fileName) {
  if (/\.pdf$/i.test(fileName)) return { cls: 'pdf', text: 'PDF' };
  return { cls: 'doc', text: 'DOC' };
}

function renderResumes() {
  const grid = $('#resume-grid');
  const countEl = $('#r-total');
  const levelsEl = $('#r-levels');
  const assignedEl = $('#r-assigned');
  const archivedEl = $('#r-archived');

  const activeResumes = resumes.filter(r => !r.archived);
  const archivedResumes = resumes.filter(r => r.archived);
  countEl.textContent = activeResumes.length;
  archivedEl.textContent = archivedResumes.length;

  // Level count
  const uniqueLevels = new Set(activeResumes.map(r => r.levelLabel).filter(Boolean));
  levelsEl.textContent = uniqueLevels.size;

  // Count filters assigned
  const totalAssigned = activeResumes.reduce((sum, r) => sum + (r.filterIds || []).length, 0);
  assignedEl.textContent = totalAssigned;

  // Coverage check
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const allAssignedFilterNames = new Set(activeResumes.flatMap(r => r.filterIds || []));
  const unassignedFilters = sf.filter(f => !allAssignedFilterNames.has(f.name));
  const coverageEl = $('#r-coverage');
  const coverageAlert = $('#resume-coverage-alert');

  if (sf.length > 0) {
    const covered = sf.length - unassignedFilters.length;
    coverageEl.textContent = `${covered}/${sf.length}`;
    coverageEl.style.color = unassignedFilters.length > 0 ? 'var(--text-dim)' : 'var(--green)';
  } else {
    coverageEl.textContent = '—';
  }

  if (unassignedFilters.length > 0 && activeResumes.length > 0) {
    coverageAlert.style.display = '';
    $('#resume-unassigned-list').innerHTML = unassignedFilters.map(f => {
      const fi = sf.indexOf(f);
      const color = filterColors[fi % filterColors.length];
      return `<span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;background:${color}15;color:${color};border:1px solid ${color}30;margin:0 2px;">${f.name.toLowerCase()}</span>`;
    }).join(' ');
  } else {
    coverageAlert.style.display = 'none';
  }

  // Update nav dots
  updateResumeNavDot();

  if (activeResumes.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="padding:32px 20px;">
      <h3>No resumes uploaded</h3>
      <p>Upload your first resume to get started.</p>
    </div>`;
    renderResumeArchive(archivedResumes);
    return;
  }

  // --- Build single resume card ---
  function buildResumeCard(r, sf, filterColors) {
    const i = resumes.indexOf(r);
    const icon = getFileIcon(r.fileName);
    const assignedIds = r.filterIds || [];
    const isPlaceholder = r.needsUpload;

    // Level selector
    const levels = (JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || []).filter(l => l.label);
    const levelOpts = levels.map(l => {
      const sel = r.levelLabel === l.label ? ' selected' : '';
      return `<option value="${l.label}" data-color="${l.color || '#94a3b8'}"${sel}>${l.label}</option>`;
    }).join('');
    const levelSelect = `<select class="pl-move-select" onchange="setResumeLevel(${i}, this)" style="min-width:100px;">
      <option value="">— Level —</option>
      ${levelOpts}
    </select>`;

    const gdriveIcon = r.source === 'gdrive'
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(66,133,244,0.1);color:#4285F4;">Drive</span>'
      : '';

    // Readiness grade from cache — shown inline on card
    let gradeHtml = '';
    if (!isPlaceholder) {
      // Always render the slot div so auto-analysis can populate it
      const hasCache = readinessCache && readinessCache.scores && readinessCache.scores[i];
      if (hasCache) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}">${buildInlineGrade(i, readinessCache.scores[i])}</div>`;
      } else if (r.textStatus === 'no-text' && r.fileName && /\.docx?$/i.test(r.fileName)) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:11px;color:var(--red);cursor:pointer;" onclick="reUploadResume(${i})" title="File needs re-upload for text extraction">⚠ Re-upload file to enable scoring <span style="text-decoration:underline;">Click here</span></div></div>`;
      } else if (r.textStatus === 'ready' && r.keywords && r.keywords.length > 0 && assignedIds.length > 0) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:10px;color:var(--text-faint);font-style:italic;">Analyzing\u2026</div></div>`;
      } else if (r.textStatus === 'ready' && r.keywords && r.keywords.length > 0 && assignedIds.length === 0) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:10px;color:var(--text-faint);">Assign a filter to see readiness grade</div></div>`;
      } else {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"></div>`;
      }
    }

    // Filter pills
    const filterPills = sf.length > 0
      ? sf.map((f, fi) => {
          const color = filterColors[fi % filterColors.length];
          const isActive = assignedIds.includes(f.name);
          return `<span class="rc-filter-pill ${isActive ? 'active' : 'inactive'}"
            style="background:${color}${isActive ? '22' : '10'};color:${color};border:1px solid ${color}${isActive ? '44' : '15'};"
            data-resume="${i}" data-filter="${f.name}" onclick="toggleResumeFilter(${i}, '${f.name.replace(/'/g, "\\\\'")}')"
            title="Click to ${isActive ? 'unassign' : 'assign'}">${f.name}</span>`;
        }).join('')
      : '<span style="font-size:11px;color:var(--text-faint);font-style:italic;">Save a filter first to assign</span>';

    // Performance stats
    const meta = getPipelineMeta();
    const jobsApplied = Object.values(meta).filter(m => m.resumeUsed === r.name && m.stage !== 'saved').length;
    const responded = Object.values(meta).filter(m => m.resumeUsed === r.name && ['responded','interview','offer'].includes(m.stage)).length;
    const responseRate = jobsApplied > 0 ? Math.round((responded / jobsApplied) * 100) : 0;
    const statsLine = jobsApplied > 0
      ? `<div style="font-size:10px;color:var(--text-faint);margin-top:6px;font-family:var(--mono);">${jobsApplied} applied \u00b7 ${responded} responded \u00b7 ${responseRate}% rate</div>`
      : '';

    return `
    <div class="resume-row ${isPlaceholder ? 'is-placeholder' : ''}">
      <div class="resume-card">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div class="rc-icon-sm ${icon.cls}" style="font-size:9px;width:32px;height:32px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;${isPlaceholder ? 'opacity:0.4;border:2px dashed var(--border);' : ''}">${isPlaceholder ? '?' : icon.text}</div>
          <div style="min-width:0;flex:1;">
            <div class="rc-name" style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(r.name||'').replace(/"/g,'&quot;')}">${r.name}</div>
            ${!isPlaceholder ? `<div style="font-size:10px;color:var(--text-faint);margin-top:2px;">${r.size} \u00b7 ${r.uploadedAt}</div>` : ''}
          </div>
          ${gdriveIcon}
        </div>
        ${!isPlaceholder && r.textStatus === 'extracting' ? '<div style="font-size:10px;color:var(--warm);margin-bottom:6px;">Extracting keywords\u2026</div>' : ''}
        <div class="rc-grade-slot" id="rc-grade-${i}" style="display:none;"></div>
        ${isPlaceholder ? `<div style="margin:8px 0;padding:8px;background:rgba(245,158,11,0.06);border:1px dashed rgba(245,158,11,0.2);border-radius:8px;text-align:center;cursor:pointer;" onclick="replaceResumePlaceholder(${i})"><div style="font-size:11px;color:var(--warm);font-weight:600;">Upload File</div><div style="font-size:10px;color:var(--text-faint);">Replace placeholder with actual resume</div></div>` : ''}
        <div style="margin:8px 0;">${levelSelect}</div>
        <div class="rc-filters-label">Assigned Filters</div>
        <div class="rc-filter-list">${filterPills}</div>
        ${statsLine}
        <div class="rc-actions">
          <button class="rc-btn rc-download" onclick="downloadResume(${i})" title="Download resume file">Download</button>
          <button class="rc-btn rc-rename" onclick="renameResume(${i})">Rename</button>
          <button class="rc-btn rc-archive" onclick="archiveResume(${i})">Archive</button>
          <button class="rc-btn rc-delete" onclick="removeResume(${i})">Delete</button>
        </div>
      </div>
      <div class="readiness-side-slot" id="readiness-side-slot-${i}">${
        !isPlaceholder && readinessCache && readinessCache.scores && readinessCache.scores[i]
          ? buildReadinessSide(i, readinessCache.scores[i])
          : (assignedIds.length > 0 && !isPlaceholder
              ? '<div class="readiness-side" id="readiness-side-' + i + '" style="display:flex;align-items:center;justify-content:center;"><button class="btn btn-sm" id="rc-analyze-' + i + '" onclick="runReadinessAnalysis({resumeIndex:' + i + '})" style="background:var(--accent);color:#fff;font-weight:600;padding:6px 18px;">Analyze</button></div>'
              : '<div class="readiness-side" id="readiness-side-' + i + '"></div>')
      }</div>
    </div>`;
  }

  // --- Group resumes by filter ---
  let gridHtml = '';

  // Track which resumes have been placed
  const placed = new Set();

  // One section per saved filter (in order)
  sf.forEach((f, fi) => {
    const color = filterColors[fi % filterColors.length];
    const filterResumes = activeResumes
      .filter(r => (r.filterIds || []).includes(f.name) && !placed.has(resumes.indexOf(r)))
      .sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        const da = new Date(b.uploadedAt || 0);
        const db = new Date(a.uploadedAt || 0);
        return da - db;
      });

    if (filterResumes.length === 0) return;

    gridHtml += `<div style="display:flex;align-items:center;gap:8px;margin-top:${fi > 0 ? '12' : '0'}px;margin-bottom:4px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:700;">${fi + 1}</span>
      <span style="font-size:13px;font-weight:600;color:${color};">${f.name}</span>
      <span style="font-size:10px;color:var(--text-faint);font-family:var(--mono);">${filterResumes.length} resume${filterResumes.length > 1 ? 's' : ''}</span>
    </div>`;

    filterResumes.forEach(r => {
      gridHtml += buildResumeCard(r, sf, filterColors);
      placed.add(resumes.indexOf(r));
    });
  });

  // Unassigned resumes (no filter assigned)
  const unassignedResumes = activeResumes.filter(r => !placed.has(resumes.indexOf(r)));
  if (unassignedResumes.length > 0) {
    gridHtml += `<div style="display:flex;align-items:center;gap:8px;margin-top:${sf.length > 0 ? '12' : '0'}px;margin-bottom:4px;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--border);color:var(--text-faint);font-size:11px;font-weight:700;">—</span>
      <span style="font-size:13px;font-weight:600;color:var(--text-faint);">Unassigned</span>
      <span style="font-size:10px;color:var(--text-faint);font-family:var(--mono);">${unassignedResumes.length}</span>
    </div>`;
    unassignedResumes.forEach(r => {
      gridHtml += buildResumeCard(r, sf, filterColors);
    });
  }

  grid.innerHTML = gridHtml;

  renderResumeArchive(archivedResumes);

  // Refresh readiness panel visibility
  if (typeof initReadinessPanel === 'function') initReadinessPanel();
}

function renderResumeArchive(archivedResumes) {
  const section = $('#resume-archive-section');
  const listEl = $('#resume-archive-list');
  const labelEl = $('#archive-count-label');
  if (!section) return;

  if (archivedResumes.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  labelEl.textContent = archivedResumes.length + ' archived';

  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  listEl.innerHTML = archivedResumes.map(r => {
    const i = resumes.indexOf(r);
    const meta = getPipelineMeta();
    const jobsApplied = Object.values(meta).filter(m => m.resumeUsed === r.name).length;
    const responded = Object.values(meta).filter(m => m.resumeUsed === r.name && ['responded','interview','offer'].includes(m.stage)).length;
    const rate = jobsApplied > 0 ? Math.round((responded / jobsApplied) * 100) + '%' : '—';
    const levelBadge = r.levelLabel
      ? `<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:${r.levelColor || '#94a3b8'}15;color:${r.levelColor || '#94a3b8'};">${r.levelLabel}</span>`
      : '';
    const filterBadges = (r.filterIds || []).map(fname => {
      const fi = sf.findIndex(f => f.name === fname);
      if (fi < 0) return '';
      const color = filterColors[fi % filterColors.length];
      return `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:${color};color:#fff;font-size:9px;font-weight:700;" title="${fname}">${fi + 1}</span>`;
    }).filter(Boolean).join(' ') || '';

    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--bg-input);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);display:flex;align-items:center;gap:6px;">${filterBadges} ${r.name} ${levelBadge}</div>
        <div style="font-size:10px;color:var(--text-faint);">Uploaded ${r.uploadedAt || '—'} · Archived ${r.archivedAt || '—'}</div>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);white-space:nowrap;">${jobsApplied} apps · ${rate} rate</div>
      <button class="rc-btn rc-rename" onclick="unarchiveResume(${i})" style="background:var(--accent);">Restore</button>
      <button class="rc-btn rc-delete" onclick="removeResume(${i})">Delete</button>
    </div>`;
  }).join('');
}

// Nav dot updates
function updateResumeNavDot() {
  const dot = $('#resume-status-dot');
  if (!dot) return;
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const activeResumes = resumes.filter(r => !r.archived);
  const allAssignedFilterNames = new Set(activeResumes.flatMap(r => r.filterIds || []));

  if (activeResumes.length === 0 || sf.length === 0 || allAssignedFilterNames.size === 0) {
    // Red: no resumes or no filters associated
    dot.className = 'ext-status-dot stale';
    dot.title = 'No resumes assigned to filters';
  } else if (sf.every(f => allAssignedFilterNames.has(f.name))) {
    // Green: every filter has a resume
    dot.className = 'ext-status-dot connected';
    dot.title = 'All filters have resumes assigned';
  } else {
    // Yellow: some filters without resumes
    dot.className = 'ext-status-dot warning';
    dot.title = 'Some filters missing resumes';
  }
}

function updatePipelineNavDot() {
  const dot = $('#pipeline-status-dot');
  if (!dot) return;
  const meta = getPipelineMeta();
  const entries = Object.values(meta);
  if (entries.length === 0) {
    dot.className = 'ext-status-dot';
    dot.title = 'No jobs tracked';
    return;
  }
  // Find most recent update (any stage change timestamp)
  let latestUpdate = 0;
  for (const m of entries) {
    for (const key of ['savedAt','appliedAt','respondedAt','interviewAt','offerAt','rejectedAt']) {
      if (m[key]) {
        const d = new Date(m[key]).getTime();
        if (d > latestUpdate) latestUpdate = d;
      }
    }
  }
  const now = Date.now();
  const daysSince = latestUpdate ? Math.floor((now - latestUpdate) / 86400000) : 999;
  if (daysSince <= 7) {
    dot.className = 'ext-status-dot connected';
    dot.title = `Pipeline updated ${daysSince === 0 ? 'today' : daysSince + 'd ago'}`;
  } else if (daysSince <= 14) {
    dot.className = 'ext-status-dot warning';
    dot.title = `Pipeline not updated in ${daysSince} days`;
  } else {
    dot.className = 'ext-status-dot stale';
    dot.title = `Pipeline stale — ${daysSince} days since last update`;
  }
}

window.toggleResumeFilter = function(resumeIdx, filterName) {
  const r = resumes[resumeIdx];
  if (!r.filterIds) r.filterIds = [];
  const idx = r.filterIds.indexOf(filterName);
  if (idx >= 0) {
    r.filterIds.splice(idx, 1);
  } else {
    r.filterIds.push(filterName);
  }
  // Clear readiness cache so it re-analyzes with new assignment
  readinessCache = null;
  localStorage.removeItem('bj_readiness');
  jobMatchScores = {};
  saveResumes();
  renderResumes();
};

window.setResumeLevel = function(idx, selectEl) {
  const val = selectEl.value;
  const levels = (JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || []);
  const lvl = levels.find(l => l.label === val);
  resumes[idx].levelLabel = val || '';
  resumes[idx].levelColor = lvl?.color || '#94a3b8';
  saveResumes();
  renderResumes();
};

window.archiveResume = function(idx) {
  if (!confirm(`Archive "${resumes[idx].name}"? It will be moved to the archive section.`)) return;
  resumes[idx].archived = true;
  resumes[idx].archivedAt = new Date().toLocaleDateString();
  saveResumes();
  renderResumes();
};

window.unarchiveResume = function(idx) {
  resumes[idx].archived = false;
  delete resumes[idx].archivedAt;
  saveResumes();
  renderResumes();
};

// ============================================================
// RESUME TEXT EXTRACTION (P4)
// ============================================================
async function extractTextFromPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText.trim();
  } catch (e) {
    console.error('[BJ] PDF text extraction failed:', e);
    return '';
  }
}

async function extractTextFromDOCX(fileOrBuffer) {
  try {
    if (typeof mammoth === 'undefined') {
      console.error('[BJ] mammoth.js not loaded');
      return '';
    }
    let arrayBuffer;
    if (fileOrBuffer instanceof ArrayBuffer) {
      arrayBuffer = fileOrBuffer;
    } else if (fileOrBuffer.arrayBuffer) {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } else {
      return '';
    }
    const result = await mammoth.extractRawText({ arrayBuffer });
    return (result.value || '').trim();
  } catch (e) {
    console.error('[BJ] DOCX text extraction failed:', e);
    return '';
  }
}

async function extractTextFromFile(file) {
  if (/\.pdf$/i.test(file.name)) {
    return await extractTextFromPDF(file);
  }
  if (/\.docx$/i.test(file.name)) {
    return await extractTextFromDOCX(file);
  }
  // Plain text fallback (.txt, .md, etc.)
  try {
    const text = await file.text();
    // Binary file detection — skip if it looks like a zip or binary
    if (text.startsWith('PK') || text.charCodeAt(0) > 127) return '';
    return text.trim();
  } catch (e) {
    return '';
  }
}

// Auto re-extract resumes stuck at "no-text" — runs on page load
async function reExtractStuckResumes() {
  let changed = false;

  // Clean up stale filterIds that reference deleted/renamed filters
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const validFilterNames = new Set(sf.map(f => f.name));
  for (let i = 0; i < resumes.length; i++) {
    if (!resumes[i].filterIds) continue;
    const before = resumes[i].filterIds.length;
    resumes[i].filterIds = resumes[i].filterIds.filter(fn => validFilterNames.has(fn));
    if (resumes[i].filterIds.length !== before) {
      changed = true;
      console.log('[BJ] Cleaned stale filterIds for', resumes[i].name, ': removed', before - resumes[i].filterIds.length, 'orphaned');
    }
  }

  for (let i = 0; i < resumes.length; i++) {
    const r = resumes[i];
    if (r.archived || r.textStatus !== 'no-text' || !r.id) continue;
    if (!r.fileName || !/\.docx$/i.test(r.fileName)) continue;

    console.log('[BJ] Re-extracting stuck resume:', r.name);
    try {
      const blob = await bjFileStore.get(r.id);
      if (!blob) { console.log('[BJ] No file in IndexedDB for', r.id); continue; }

      const arrayBuffer = await blob.arrayBuffer();
      const text = await extractTextFromDOCX(arrayBuffer);
      if (text && text.length > 50) {
        resumes[i].extractedText = text;
        resumes[i].keywords = extractResumeKeywords(text);
        resumes[i].textStatus = 'ready';
        changed = true;
        console.log('[BJ] Re-extracted:', r.name, '→', text.length, 'chars,', resumes[i].keywords.length, 'keywords');
      } else {
        console.log('[BJ] Re-extraction got no text for', r.name);
      }
    } catch (e) {
      console.error('[BJ] Re-extraction error for', r.name, e);
    }
  }
  if (changed) {
    saveResumes();
    renderResumes();
  }
}

function extractResumeKeywords(text) {
  if (!text || text.length < 50) return [];
  const words = tokenize(text);
  const counts = {};
  for (const w of words) {
    if (!KW_STOPWORDS.has(w) && !KW_GENERIC.has(w) && w.length > 2) {
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  return Object.entries(counts).filter(([_, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

async function addResume(file) {
  // Check entitlement — count only active (non-archived) resumes
  var activeCount = resumes.filter(function(r) { return !r.archived; }).length;
  var ent = await checkEntitlement('resumes', activeCount);
  if (!ent.allowed) { showUpgradePrompt('Resume Uploads', ent); return; }

  const id = 'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const sizeStr = file.size < 1024 * 1024
    ? (file.size / 1024).toFixed(0) + ' KB'
    : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
  const resume = {
    id,
    name: file.name.replace(/\.(pdf|docx?|doc)$/i, ''),
    fileName: file.name,
    size: sizeStr,
    filterIds: [],
    uploadedAt: new Date().toLocaleDateString(),
    levelLabel: '',
    levelColor: '',
    archived: false,
    extractedText: '',
    keywords: [],
    textStatus: 'extracting'
  };
  resumes.push(resume);
  saveResumes();
  clearEntitlementCache('resumes');
  renderResumes();
  // Store file blob in IndexedDB for downloads
  bjFileStore.put(id, file).catch(e => console.warn('[BJ] File store error:', e));

  extractTextFromFile(file).then(text => {
    const idx = resumes.findIndex(r => r.id === id);
    if (idx < 0) return;
    resumes[idx].extractedText = text;
    resumes[idx].keywords = extractResumeKeywords(text);
    resumes[idx].textStatus = text ? 'ready' : 'no-text';
    saveResumes();
    renderResumes();
  });
}

window.toggleResumeKeywords = function(idx) {
  const el = document.getElementById(`rc-kw-${idx}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

window.renameResume = function(idx) {
  const current = resumes[idx].name;
  const input = prompt('Resume name:', current);
  if (input === null || !input.trim()) return;
  resumes[idx].name = input.trim();
  saveResumes();
  renderResumes();
};

window.removeResume = function(idx) {
  if (!confirm(`Permanently delete "${resumes[idx].name}"?`)) return;
  // Clean up stored file
  bjFileStore.delete(resumes[idx].id).catch(() => {});
  resumes.splice(idx, 1);
  saveResumes();
  renderResumes();
};

// IndexedDB file store for resume downloads
const bjFileStore = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('bj_resume_files', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => { this._db = req.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
  },
  async put(id, file) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async get(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },
  async delete(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

window.downloadResume = async function(idx) {
  const r = resumes[idx];
  if (!r) return;
  try {
    const file = await bjFileStore.get(r.id);
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || (r.name + '.pdf');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert('File data not available. Re-upload this resume to enable downloads.');
    }
  } catch(e) {
    alert('Download failed: ' + e.message);
  }
};

window.replaceResumePlaceholder = function(idx) {
  const tmpInput = document.createElement('input');
  tmpInput.type = 'file';
  tmpInput.accept = '.pdf,.doc,.docx';
  tmpInput.addEventListener('change', () => {
    const file = tmpInput.files[0];
    if (!file) return;
    const sizeStr = file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(0) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    resumes[idx].fileName = file.name;
    resumes[idx].size = sizeStr;
    resumes[idx].needsUpload = false;
    resumes[idx].source = 'upload';
    resumes[idx].textStatus = 'extracting';
    saveResumes();
    renderResumes();

    extractTextFromFile(file).then(text => {
      if (!resumes[idx]) return;
      resumes[idx].extractedText = text;
      resumes[idx].keywords = extractResumeKeywords(text);
      resumes[idx].textStatus = text ? 'ready' : 'no-text';
      saveResumes();
      renderResumes();
    });
  });
  tmpInput.click();
};

// Re-upload file for existing resume (when IndexedDB file is missing)
window.reUploadResume = function(idx) {
  const tmpInput = document.createElement('input');
  tmpInput.type = 'file';
  tmpInput.accept = '.pdf,.doc,.docx';
  tmpInput.addEventListener('change', () => {
    const file = tmpInput.files[0];
    if (!file) return;
    const sizeStr = file.size < 1024 * 1024
      ? (file.size / 1024).toFixed(0) + ' KB'
      : (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    resumes[idx].fileName = file.name;
    resumes[idx].size = sizeStr;
    resumes[idx].source = 'upload';
    resumes[idx].textStatus = 'extracting';
    // Clear stale readiness cache
    readinessCache = null;
    localStorage.removeItem('bj_readiness');
    jobMatchScores = {};
    saveResumes();
    renderResumes();

    // Store file blob in IndexedDB
    bjFileStore.put(resumes[idx].id, file).catch(e => console.warn('[BJ] File store error:', e));

    extractTextFromFile(file).then(text => {
      if (!resumes[idx]) return;
      resumes[idx].extractedText = text;
      resumes[idx].keywords = extractResumeKeywords(text);
      resumes[idx].textStatus = text ? 'ready' : 'no-text';
      saveResumes();
      renderResumes();
      if (text) {
        console.log('[BJ] Re-upload extraction:', resumes[idx].name, '→', text.length, 'chars,', resumes[idx].keywords.length, 'keywords');
      }
    });
  });
  tmpInput.click();
};

// Resume file input handler
const resumeInput = $('#resume-file-input');
const resumeZone = $('#resume-upload-zone');
if (resumeZone) {
  resumeZone.addEventListener('click', () => resumeInput.click());
  resumeZone.addEventListener('dragover', e => { e.preventDefault(); resumeZone.style.borderColor = 'var(--accent)'; });
  resumeZone.addEventListener('dragleave', () => { resumeZone.style.borderColor = ''; });
  resumeZone.addEventListener('drop', e => {
    e.preventDefault();
    resumeZone.style.borderColor = '';
    Array.from(e.dataTransfer.files).forEach(f => addResume(f));
  });
}
if (resumeInput) {
  resumeInput.addEventListener('change', () => {
    Array.from(resumeInput.files).forEach(f => addResume(f));
    resumeInput.value = '';
  });
}

renderResumes();

// Create by Level — scaffold resume placeholders for each level in the hierarchy
$('#resume-from-level-btn')?.addEventListener('click', async () => {
  const levels = JSON.parse(localStorage.getItem('bj_tuning') || '{}').levelHierarchy || [];
  if (levels.length === 0) {
    alert('No title levels configured. Go to Search Tuning → Title Level Hierarchy to set up your levels first.');
    return;
  }

  const existingNames = resumes.filter(r => !r.archived).map(r => r.name.toLowerCase());
  const newLevels = levels.filter(l => l.label && !existingNames.includes(l.label.toLowerCase() + ' resume'));

  if (newLevels.length === 0) {
    alert('You already have resume placeholders for all configured levels.');
    return;
  }

  // Check entitlement for total resumes after adding
  var activeCount = resumes.filter(r => !r.archived).length;
  var ent = await checkEntitlement('resumes', activeCount + newLevels.length - 1);
  if (!ent.allowed) { showUpgradePrompt('Resume Uploads', ent); return; }

  if (!confirm(`Create ${newLevels.length} resume placeholder${newLevels.length > 1 ? 's' : ''} for:\n\n${newLevels.map((l, i) => `${i+1}. ${l.label}`).join('\n')}\n\nUpload the actual files to each card after.`)) return;

  newLevels.forEach((lvl, i) => {
    resumes.push({
      id: 'res_lvl_' + Date.now() + '_' + i,
      name: lvl.label + ' Resume',
      fileName: 'Upload your ' + lvl.label.toLowerCase() + '-level resume',
      size: '—',
      filterIds: [],
      uploadedAt: new Date().toLocaleDateString(),
      source: 'level-placeholder',
      levelLabel: lvl.label,
      levelColor: lvl.color || '#94a3b8',
      needsUpload: true,
      archived: false,
    });
  });
  saveResumes();
  renderResumes();
});

// Init nav dots
setTimeout(() => { updatePipelineNavDot(); }, 1200);

// Auto re-extract DOCX resumes stuck at "no-text" once mammoth.js is loaded
setTimeout(() => {
  if (typeof mammoth !== 'undefined') {
    reExtractStuckResumes();
  } else {
    // Wait for mammoth to load
    const waitForMammoth = setInterval(() => {
      if (typeof mammoth !== 'undefined') {
        clearInterval(waitForMammoth);
        reExtractStuckResumes();
      }
    }, 500);
    setTimeout(() => clearInterval(waitForMammoth), 10000); // Give up after 10s
  }
}, 1500);