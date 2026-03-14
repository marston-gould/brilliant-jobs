// === js/resumes.js ===
// ============================================================
// RESUMES
// ============================================================
// `resumes` global is declared in globals.js (shell) and populated
// by cloud recovery in app.js. Do NOT re-read here — safeReadLS
// returns [] for encrypted PII data, destroying recovered state.

function saveResumes() {
  saveUserData('bj_resumes', JSON.stringify(resumes));
}

// Persist extracted resume text back to resume_archive so it survives
// across devices and browser storage clears
function persistResumeTextToDB(resumeId, text) {
  if (!text || text.length < 100 || typeof sb === 'undefined') return;
  var r = resumes.find(function(x) { return x.id === resumeId; });
  if (!r || !r.archiveId) return;
  sb.from('resume_archive')
    .update({ extracted_text: text.slice(0, 50000) })
    .eq('resume_id', r.archiveId)
    .then(function(res) {
      if (res.error) console.warn('[resume-text] Failed to persist extracted_text:', res.error.message);
      else console.log('[resume-text] Persisted extracted_text to DB for', r.name);
    });
}

// On every login, patch any resumes in localStorage that are missing extractedText
// by fetching from resume_archive.extracted_text. Runs once per session, silently.

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

  // If no active resumes in localStorage but user is authenticated, attempt cloud recovery
  // Uses a 30s cooldown instead of a one-shot flag so recovery retries on tab revisit after failure
  var _syncCooldownMs = 30000;
  var _canSync = !renderResumes._syncLastAttempt || (Date.now() - renderResumes._syncLastAttempt > _syncCooldownMs);
  if (activeResumes.length === 0 && _canSync && typeof sb !== 'undefined' && typeof currentUser !== 'undefined' && currentUser) {
    renderResumes._syncLastAttempt = Date.now();
    console.log('[resume-render] No active resumes — triggering cloud recovery');
    // Show loading indicator while recovery is in-flight
    if (grid) grid.innerHTML = '<div class="empty-state" style="padding:32px 20px;"><div class="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" style="border:2px solid var(--accent);border-top-color:transparent;width:24px;height:24px;border-radius:50%;animation:spin .8s linear infinite;display:inline-block;"></div><p style="font-size:12px;color:var(--text-faint);margin-top:8px;">Recovering resumes…</p></div>';
    (async function() {
      try {
        var userId = currentUser.id;
        var { data: archiveRows, error } = await sb.from('resume_archive')
          .select('resume_id, display_name, storage_path, is_active, is_archived, file_size_bytes, file_type, created_at, metadata_snapshot, extracted_text')
          .eq('user_id', userId)
          .eq('is_active', true);
        if (error || !archiveRows || archiveRows.length === 0) {
          console.log('[resume-render] No active resumes in archive either:', error?.message || 'none found');
          renderResumes._syncLastAttempt = 0; // Allow immediate retry on next tab visit
          renderResumes(); // Re-render to clear loading state
          return;
        }
        console.log('[resume-render] Found', archiveRows.length, 'active resumes in archive — syncing');
        var dirty = false;
        archiveRows.forEach(function(row) {
          // Check if already exists in resumes array
          var existingIdx = resumes.findIndex(function(r) { return r.archiveId === row.resume_id || (r.storagePath && r.storagePath === row.storage_path); });
          if (existingIdx >= 0) {
            // Patch missing extractedText from DB if we have it
            var existing = resumes[existingIdx];
            if ((!existing.extractedText || existing.extractedText.length < 100) && row.extracted_text && row.extracted_text.length > 100) {
              resumes[existingIdx].extractedText = row.extracted_text;
              if (typeof extractResumeKeywords === 'function') {
                resumes[existingIdx].keywords = extractResumeKeywords(row.extracted_text);
              }
              resumes[existingIdx].textStatus = 'ready';
              if (!resumes[existingIdx].archiveId) resumes[existingIdx].archiveId = row.resume_id;
              dirty = true;
              console.log('[resume-render] Patched extractedText from DB for:', existing.name);
            }
            return;
          }
          var stub = {
            id: 'res_sync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            name: row.display_name || 'Synced Resume',
            fileName: row.display_name || 'synced-resume',
            size: row.file_size_bytes ? (row.file_size_bytes < 1048576 ? Math.round(row.file_size_bytes / 1024) + ' KB' : (row.file_size_bytes / 1048576).toFixed(1) + ' MB') : '—',
            filterIds: (row.metadata_snapshot && row.metadata_snapshot.filter_ids) || [],
            uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
            levelLabel: (row.metadata_snapshot && row.metadata_snapshot.level_label) || '',
            levelColor: (row.metadata_snapshot && row.metadata_snapshot.level_color) || '',
            archived: false,
            extractedText: row.extracted_text || '',
            keywords: row.extracted_text && row.extracted_text.length > 100 && typeof extractResumeKeywords === 'function'
              ? extractResumeKeywords(row.extracted_text) : [],
            textStatus: row.extracted_text && row.extracted_text.length > 100 ? 'ready' : 'needs-reextract',
            storagePath: row.storage_path,
            archiveId: row.resume_id
          };
          resumes.push(stub);
          dirty = true;
          console.log('[resume-render] Recovered resume from archive:', row.display_name);
        });
        if (dirty) {
          saveResumes();
        }
        renderResumes();
      } catch(e) {
        reportError('resumes', e); console.warn('[resume-render] Cloud recovery failed:', e);
        renderResumes._syncLastAttempt = 0; // Allow retry on next visit
        renderResumes(); // Re-render to clear loading state
      }
    })();
    return; // Don't render empty state while recovery is in-flight
  }

  countEl.textContent = activeResumes.length;
  archivedEl.textContent = archivedResumes.length;

  // Collapse upload zone when resumes exist
  const uploadZone = $('#resume-upload-zone');
  if (uploadZone) {
    if (activeResumes.length > 0) {
      uploadZone.style.padding = '8px 16px';
      uploadZone.style.minHeight = '0';
      uploadZone.style.cursor = 'pointer';
      uploadZone.innerHTML = '<input type="file" id="resume-file-input" accept=".pdf,.doc,.docx" style="display:none;" multiple>' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:8px;"><i data-lucide="plus" class="icon-sm icon-stroke" style="stroke:var(--text-faint);"></i><span style="font-size:11px;color:var(--text-faint);">Add another resume</span></div>';
      uploadZone.onclick = function() { $('#resume-file-input').click(); };
    } else {
      uploadZone.style.padding = '';
      uploadZone.style.minHeight = '';
      uploadZone.style.cursor = '';
      uploadZone.innerHTML = '<input type="file" id="resume-file-input" accept=".pdf,.doc,.docx" style="display:none;" multiple>' +
        '<h4>Drop resumes here or click to upload</h4><p>PDF, DOC, or DOCX — up to 5MB each</p>';
      uploadZone.onclick = function() { $('#resume-file-input').click(); };
    }
    // Re-bind file input change handler
    $('#resume-file-input').addEventListener('change', handleResumeFileInput);
  }

  // Level count
  const uniqueLevels = new Set(activeResumes.map(r => r.levelLabel).filter(Boolean));
  levelsEl.textContent = uniqueLevels.size;

  // Count filters assigned
  const totalAssigned = activeResumes.reduce((sum, r) => sum + (r.filterIds || []).length, 0);
  assignedEl.textContent = totalAssigned;

  // Coverage check
  const sf = safeReadLS('bj_saved_filters', []);
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
      <h3>Drop your resume here to get started</h3>
      <p style="font-size:13px;color:var(--text-dim);margin-top:8px;">Upload a resume and we'll show you how it stacks up against real job postings.</p>
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

    // Level selector — multi-select pills (like filter pills)
    const levels = (safeReadLS('bj_tuning', {}).levelHierarchy || []).filter(l => l.label);
    // Backward compat: r.levelLabel (string) → r.levelLabels (array)
    const assignedLevels = r.levelLabels || (r.levelLabel ? [r.levelLabel] : []);
    const levelPills = levels.length > 0
      ? levels.map(l => {
          const isActive = assignedLevels.includes(l.label);
          const color = l.color || '#94a3b8';
          return `<span class="rc-filter-pill ${isActive ? 'active' : 'inactive'}"
            style="background:${color}${isActive ? '22' : '10'};color:${color};border:1px solid ${color}${isActive ? '44' : '15'};cursor:pointer;"
            onclick="event.stopPropagation();toggleResumeLevel(${i}, '${l.label.replace(/'/g, "\\\\'")}')"
            title="Click to ${isActive ? 'remove' : 'add'} level">${l.label}</span>`;
        }).join('')
      : '<span style="font-size:11px;color:var(--text-faint);font-style:italic;">Set levels in Search Tuning first</span>';

    const gdriveIcon = r.source === 'gdrive'
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(66,133,244,0.1);color:#4285F4;">Drive</span>'
      : '';

    // G26: Tier provenance badge
    const tierBadge = r.source === 'rewrite'
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:linear-gradient(135deg,rgba(77,142,255,0.1),rgba(124,58,237,0.1));border:1px solid rgba(77,142,255,0.15);color:#4d8eff;cursor:help;" title="' + (r.tier_history || []).map(function(h) { return h.action + ' (' + h.tier + ')'; }).join(' → ') + '"><i data-lucide="sparkles" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;"></i> Premium Rewrite' + (r.rewrite_round > 1 ? ' R' + r.rewrite_round : '') + '</span>'
      : '';

    // v6.38: AI content detection badge
    const aiData = r.aiScore;
    let aiBadge = '';
    if (r.aiScoreStatus === 'scoring') {
      aiBadge = '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:rgba(148,163,184,0.1);color:#94a3b8;border:1px solid rgba(148,163,184,0.15);cursor:help;display:inline-flex;align-items:center;gap:3px;" title="Analyzing content for AI authorship…"><i data-lucide="loader-2" class="icon-xs icon-stroke"></i> Scoring…</span>';
    } else if (aiData && aiData.label) {
      const aiColors = { human: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', text: 'var(--green)', icon: '<i data-lucide="check" class="icon-xs icon-stroke" style="color:var(--green)"></i>' }, mixed: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.2)', text: '#eab308', icon: '<i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="color:var(--warm)"></i>' }, ai_generated: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#ef4444', icon: '<i data-lucide="scan-text" class="icon-xs icon-stroke" style="color:var(--red)"></i>' }, unknown: { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', text: '#94a3b8', icon: '<i data-lucide="help-circle" class="icon-xs icon-stroke"></i>' } };
      const ac = aiColors[aiData.label] || aiColors.unknown;
      const aiPct = Math.round((aiData.score || 0) * 100);
      const labelText = aiData.label === 'ai_generated' ? 'AI-Generated' : aiData.label === 'mixed' ? 'Mixed' : aiData.label === 'human' ? 'Human-Written' : 'Unknown';
      aiBadge = '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:' + ac.bg + ';color:' + ac.text + ';border:1px solid ' + ac.border + ';cursor:help;" title="AI Detection: ' + labelText + ' (' + aiPct + '% AI probability)\n' + (aiData.summary || '').replace(/"/g, '&quot;') + '">' + ac.icon + ' ' + labelText + ' ' + aiPct + '%</span>';
    }

    // v6.39: Rescore button (next to AI badge)
    let rescoreBtn = '';
    if (!isPlaceholder && r.extractedText && r.extractedText.length >= 100 && r.aiScoreStatus !== 'scoring') {
      const isCooldown = r._rescoreCooldownUntil && Date.now() < r._rescoreCooldownUntil;
      const cooldownSec = isCooldown ? Math.ceil((r._rescoreCooldownUntil - Date.now()) / 1000) : 0;
      rescoreBtn = '<button onclick="event.stopPropagation();handleRescore(' + i + ')" ' +
        'id="rescore-btn-' + i + '" ' +
        'style="font-size:9px;font-weight:600;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.1);color:#6366f1;border:1px solid rgba(99,102,241,0.15);cursor:' + (isCooldown ? 'not-allowed' : 'pointer') + ';margin-left:4px;' + (isCooldown ? 'opacity:0.5;' : '') + '" ' +
        'title="' + (isCooldown ? 'Cooldown: wait ' + cooldownSec + 's' : 'Re-analyze for AI content') + '" ' +
        (isCooldown ? 'disabled' : '') + '><i data-lucide="refresh-cw" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;"></i> Rescore</button>';
    }

    // v6.39: Score history (previous vs current)
    let scoreHistory = '';
    if (aiData && aiData.label && r.aiScoreHistory && r.aiScoreHistory.length > 1) {
      const prev = r.aiScoreHistory[r.aiScoreHistory.length - 2];
      const prevPct = Math.round((prev.score || 0) * 100);
      const currPct = Math.round((aiData.score || 0) * 100);
      const delta = currPct - prevPct;
      const arrow = delta > 0 ? '\u2191' : delta < 0 ? '\u2193' : '\u2194';
      const deltaColor = delta > 5 ? '#ef4444' : delta < -5 ? 'var(--green)' : '#94a3b8';
      scoreHistory = '<span style="font-size:8px;color:' + deltaColor + ';margin-left:4px;cursor:help;" title="Previous: ' + prevPct + '% AI (' + new Date(prev.scoredAt).toLocaleString() + ')">' + arrow + ' was ' + prevPct + '%</span>';
    }

    // Readiness grade from cache — shown inline on card
    let gradeHtml = '';
    if (!isPlaceholder) {
      // Always render the slot div so auto-analysis can populate it
      const hasCache = readinessCache && readinessCache.scores && readinessCache.scores[i];
      if (hasCache) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}">${buildInlineGrade(i, readinessCache.scores[i])}</div>`;
      } else if (r.textStatus === 'no-text' && r.fileName && /\.docx?$/i.test(r.fileName)) {
        gradeHtml = `<div class="rc-grade-slot" id="rc-grade-${i}"><div style="font-size:11px;color:var(--red);cursor:pointer;" onclick="reUploadResume(${i})" title="File needs re-upload for text extraction"><i data-lucide="triangle-alert" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;color:var(--red);"></i> Re-upload file to enable scoring <span style="text-decoration:underline;">Click here</span></div></div>`;
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
            style="background:${color}${isActive ? '22' : '10'};color:${color};border:1px solid ${color}${isActive ? '44' : '15'};cursor:pointer;"
            data-resume="${i}" data-filter="${f.name}" onclick="event.stopPropagation();toggleResumeFilter(${i}, '${f.name.replace(/'/g, "\\\\'")}')"
            title="Click to ${isActive ? 'unassign' : 'assign'}">${f.name}</span>`;
        }).join('')
      : '<span style="font-size:11px;color:var(--text-faint);font-style:italic;">Save a filter first to assign</span>';

    // Performance stats
    const meta = (typeof getPipelineMeta === 'function' ? getPipelineMeta() : {});
    const jobsApplied = Object.values(meta).filter(m => m.resumeUsed === r.name && m.stage !== 'saved').length;
    const responded = Object.values(meta).filter(m => m.resumeUsed === r.name && ['responded','interview','offer'].includes(m.stage)).length;
    const responseRate = jobsApplied > 0 ? Math.round((responded / jobsApplied) * 100) : 0;
    const statsLine = jobsApplied > 0
      ? `<div style="font-size:10px;color:var(--text-faint);margin-top:6px;font-family:var(--mono);">${jobsApplied} applied \u00b7 ${responded} responded \u00b7 ${responseRate}% rate</div>`
      : '';

    // Score badge from cache
    const cachedScore = readinessCache && readinessCache.scores && readinessCache.scores[i];
    const scoreVal = cachedScore ? cachedScore.overallScore : null;
    const scoreClass = scoreVal >= 75 ? 'high' : scoreVal >= 50 ? 'mid' : scoreVal !== null ? 'low' : 'none';
    const scoreLabel = scoreVal >= 75 ? 'Strong' : scoreVal >= 50 ? 'Partial' : scoreVal !== null ? 'Weak' : '';
    const scoreDisplay = scoreVal !== null ? `${scoreVal}<div class="nri-score-label">${scoreLabel}</div>` : (isPlaceholder ? '—' : (assignedIds.length > 0 ? '<div class="nri-score-label" style="font-size:9px;">Score</div>' : '—'));

    // Filter dots (compact representation for row)
    const filterDots = sf.map((f, fi) => {
      const color = filterColors[fi % filterColors.length];
      const isActive = assignedIds.includes(f.name);
      return isActive ? `<span class="nri-filter-dot active" style="background:${color};" title="${f.name}"></span>` : '';
    }).filter(Boolean).join('');

    return `
    <div class="new-resume-item ${isPlaceholder ? 'is-placeholder' : ''}" id="nri-${i}" onclick="toggleResumePanel(${i}, event)">
      <div class="nri-row">
        <span class="sf-del" onclick="event.stopPropagation();confirmDeleteResume(${i})" title="Delete"><i data-lucide="x" class="icon-xs icon-stroke"></i></span>
        <div class="nri-icon ${icon.cls}">${isPlaceholder ? '?' : icon.text}</div>
        <div class="nri-info">
          <div class="nri-name" title="${escapeHtml(r.name||'')}">${escapeHtml(r.name)}${gdriveIcon}${tierBadge}${aiBadge}${scoreHistory}${rescoreBtn}</div>
          <div class="nri-meta">${!isPlaceholder ? r.size + ' \u00b7 ' + r.uploadedAt : 'Placeholder'} \u00b7 ${assignedIds.length} filter${assignedIds.length !== 1 ? 's' : ''}${assignedLevels.length > 0 ? ' \u00b7 ' + assignedLevels.join(', ') : ''}${jobsApplied > 0 ? ' \u00b7 ' + jobsApplied + ' applied' : ''}</div>
        </div>
        <div class="nri-filters">${filterDots}</div>
        <div class="nri-score ${scoreClass}">${scoreDisplay}</div>
        <div class="nri-actions" onclick="event.stopPropagation()">
          <button onclick="openAssignPopover(${i}, this)" title="Manage filter assignment"><i data-lucide="link" class="icon-sm icon-stroke"></i></button>
          <button onclick="downloadResume(${i})" title="Download"><i data-lucide="download" class="icon-sm icon-stroke"></i></button>
          <button onclick="renameResume(${i})" title="Rename"><i data-lucide="pencil" class="icon-sm icon-stroke"></i></button>
          <button onclick="archiveResume(${i})" title="Archive"><i data-lucide="archive" class="icon-sm icon-stroke"></i></button>
        </div>
      </div>
      <div class="rc-grade-slot" id="rc-grade-${i}" style="display:none;"></div>
      <!-- AI Analysis Panel (expanded on click) -->
      <div class="ai-panel" id="ai-panel-${i}">
        <div id="ai-panel-content-${i}">
          ${cachedScore ? buildReadinessSide(i, cachedScore) : (assignedIds.length > 0 && !isPlaceholder
            ? '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:20px 0;"><button class="btn btn-sm" id="rc-score-' + i + '" onclick="event.stopPropagation();handleScoreClick(' + i + ')" style="background:var(--accent);color:#fff;font-weight:600;padding:6px 18px;">Analyze Resume</button><div style="font-size:10px;color:var(--text-faint);">Scores readiness against your assigned filter</div></div>'
            : '<div style="padding:16px 0;text-align:center;">' + (isPlaceholder
              ? '<div style="font-size:12px;color:var(--warm);cursor:pointer;" onclick="event.stopPropagation();replaceResumePlaceholder(' + i + ')">Upload a file to enable scoring</div>'
              : '<div style="font-size:12px;color:var(--text-faint);">Assign a filter to see readiness analysis</div>') + '</div>')}
        </div>
        ${!isPlaceholder ? `
        <div style="margin-top:8px;padding-top:12px;border-top:1px solid var(--border);display:flex;gap:4px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:600;color:var(--text-faint);margin-right:4px;line-height:22px;">Filters:</span>
          ${filterPills}
          ${assignedIds.length > 1 ? '<span style="font-size:10px;font-weight:600;color:var(--red);cursor:pointer;margin-left:4px;line-height:22px;" onclick="event.stopPropagation();clearAllFilters(' + i + ')">Clear all</span>' : ''}
        </div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:4px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:600;color:var(--text-faint);margin-right:4px;line-height:22px;">Levels:</span>
          ${levelPills}
        </div>` : ''}
        <!-- Rewrite Interview Promo -->
        ${cachedScore && cachedScore.overallScore < 85 && !isPlaceholder ? `
        <div class="ai-rewrite-promo">
          <div class="ai-rewrite-promo-text">
            <h4>\u2728 Guided Rewrite Interview</h4>
            <p>Fill gaps, quantify impact, and strategically position your experience. Get a tailored rewrite with a side-by-side diff.</p>
            <div class="ai-interview-preview">
              <div class="ai-interview-step"><strong>1</strong>Fill Gaps</div>
              <div class="ai-interview-step"><strong>2</strong>Quantify</div>
              <div class="ai-interview-step"><strong>3</strong>Position</div>
              <div class="ai-interview-step"><strong>4</strong>Rewrite</div>
            </div>
          </div>
          <button class="btn btn-primary" onclick="event.stopPropagation();launchRewriteInterview(${i})" style="white-space:nowrap;flex-shrink:0;">Start Rewrite</button>
        </div>` : ''}
      </div>
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
  if (typeof window.refreshIcons === 'function') window.refreshIcons();
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

  const sf = safeReadLS('bj_saved_filters', []);

  listEl.innerHTML = archivedResumes.map(r => {
    const i = resumes.indexOf(r);
    const meta = (typeof getPipelineMeta === 'function' ? getPipelineMeta() : {});
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
      <span class="sf-del" onclick="confirmDeleteResume(${i})" title="Delete" style="opacity:0.4;font-size:11px;color:var(--text-faint);cursor:pointer;width:20px;text-align:center;flex-shrink:0;border-radius:4px;"><i data-lucide="x" class="icon-xs icon-stroke"></i></span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;color:var(--text-dim);display:flex;align-items:center;gap:6px;">${filterBadges} ${r.name} ${levelBadge}</div>
        <div style="font-size:10px;color:var(--text-faint);">Uploaded ${r.uploadedAt || '—'} · Archived ${r.archivedAt || '—'}</div>
      </div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--text-faint);white-space:nowrap;">${jobsApplied} apps · ${rate} rate</div>
      <button class="rc-btn rc-download" onclick="unarchiveResume(${i})">Restore</button>
    </div>`;
  }).join('');

  // G25: Render cover letter archive
  if (typeof bjRenderCoverLetterArchive === 'function') bjRenderCoverLetterArchive();
}

// Nav dot updates
function updateResumeNavDot() {
  const dot = $('#resume-status-dot');
  if (!dot) return;
  const sf = safeReadLS('bj_saved_filters', []);
  const activeResumes = resumes.filter(r => !r.archived);
  const allAssignedFilterNames = new Set(activeResumes.flatMap(r => r.filterIds || []));

  if (activeResumes.length === 0 || sf.length === 0 || allAssignedFilterNames.size === 0) {
    // Red: no resumes or no filters associated
    dot.className = 'ext-status-dot stale';
    dot.title = 'Assign resumes to saved searches for targeted scoring';
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
  const meta = (typeof getPipelineMeta === 'function' ? getPipelineMeta() : {});
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
    // UNASSIGN — always allowed
    r.filterIds.splice(idx, 1);
  } else {
    // ASSIGN — validate level uniqueness first
    const myLevels = r.levelLabels || (r.levelLabel ? [r.levelLabel] : []);
    const conflicting = resumes.filter(function(other, oi) {
      return oi !== resumeIdx && !other.archived
        && (other.filterIds || []).includes(filterName);
    });
    for (var ci = 0; ci < conflicting.length; ci++) {
      var other = conflicting[ci];
      var otherLevels = other.levelLabels || (other.levelLabel ? [other.levelLabel] : []);
      if (myLevels.length === 0 || otherLevels.length === 0) {
        toastWarning('Assign a level to both resumes before sharing a filter.');
        if (typeof reportError === 'function') reportError('resume_filter_validation', 'no_level', { resume: r.name, filter: filterName });
        return;
      }
      var overlap = myLevels.some(function(l) { return otherLevels.includes(l); });
      if (overlap) {
        toastWarning('"' + (other.name || 'Another resume') + '" already covers that level on this filter.');
        if (typeof reportError === 'function') reportError('resume_filter_validation', 'level_overlap', { resume: r.name, other: other.name, filter: filterName });
        return;
      }
    }
    r.filterIds.push(filterName);
  }
  // Clear readiness cache so it re-analyzes with new assignment
  readinessCache = null;
  localStorage.removeItem('bj_readiness');
  jobMatchScores = {};
  saveResumes();
  renderResumes();
  // Re-open the panel that was active before re-render
  if (_activeResumePanel >= 0) {
    var panel = document.getElementById('ai-panel-' + _activeResumePanel);
    var row = document.getElementById('nri-' + _activeResumePanel);
    if (panel) panel.classList.add('open');
    if (row) row.classList.add('selected');
  }
};

// POD3-RESUME-ASSIGN-001: Clear all filter assignments from a resume
window.clearAllFilters = function(idx) {
  resumes[idx].filterIds = [];
  readinessCache = null;
  localStorage.removeItem('bj_readiness');
  jobMatchScores = {};
  saveResumes();
  renderResumes();
};

// POD3-RESUME-ASSIGN-001: Assignment popover
var _activeAssignPopover = null;
window.openAssignPopover = function(idx, btnEl) {
  // Close existing popover
  if (_activeAssignPopover) { _activeAssignPopover.remove(); _activeAssignPopover = null; }
  var r = resumes[idx];
  var sf = safeReadLS('bj_saved_filters', []);
  if (sf.length === 0) { toastWarning('Save a filter first to assign resumes.'); return; }
  var assignedIds = r.filterIds || [];
  var pop = document.createElement('div');
  pop.className = 'assign-popover';
  pop.style.cssText = 'position:absolute;z-index:9999;background:var(--bg-card);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:12px;min-width:200px;max-width:280px;';
  var html = '<div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px;">Assign to Filters</div>';
  sf.forEach(function(f, fi) {
    var color = filterColors[fi % filterColors.length];
    var checked = assignedIds.includes(f.name) ? 'checked' : '';
    var escaped = f.name.replace(/'/g, "\\'");
    html += '<label style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer;font-size:12px;color:var(--text);">'
      + '<input type="checkbox" ' + checked + ' onchange="toggleResumeFilter(' + idx + ',\'' + escaped + '\')">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0;"></span>'
      + f.name + '</label>';
  });
  if (assignedIds.length > 0) {
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">'
      + '<span style="font-size:10px;font-weight:600;color:var(--red);cursor:pointer;" onclick="clearAllFilters(' + idx + ')">Unassign All</span></div>';
  }
  pop.innerHTML = html;
  // Position relative to button
  var rect = btnEl.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.top = (rect.bottom + 4) + 'px';
  pop.style.left = Math.max(8, rect.left - 100) + 'px';
  document.body.appendChild(pop);
  _activeAssignPopover = pop;
  // Close on outside click or Escape
  function closePopover(e) {
    if (e.type === 'keydown' && e.key !== 'Escape') return;
    if (e.type === 'click' && pop.contains(e.target)) return;
    pop.remove();
    _activeAssignPopover = null;
    document.removeEventListener('click', closePopover, true);
    document.removeEventListener('keydown', closePopover, true);
  }
  setTimeout(function() {
    document.addEventListener('click', closePopover, true);
    document.addEventListener('keydown', closePopover, true);
  }, 10);
  if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [pop] });
};

window.toggleResumeLevel = function(idx, levelLabel) {
  const r = resumes[idx];
  // Migrate from old single levelLabel to new levelLabels array
  if (!r.levelLabels) r.levelLabels = r.levelLabel ? [r.levelLabel] : [];
  const pos = r.levelLabels.indexOf(levelLabel);
  if (pos >= 0) {
    r.levelLabels.splice(pos, 1);
  } else {
    // Adding a level — check if it creates a conflict on any shared filter
    var proposedLevels = r.levelLabels.concat([levelLabel]);
    var myFilters = r.filterIds || [];
    for (var fi = 0; fi < myFilters.length; fi++) {
      var fname = myFilters[fi];
      var others = resumes.filter(function(other, oi) {
        return oi !== idx && !other.archived && (other.filterIds || []).includes(fname);
      });
      for (var oi = 0; oi < others.length; oi++) {
        var otherLevels = others[oi].levelLabels || (others[oi].levelLabel ? [others[oi].levelLabel] : []);
        var overlap = proposedLevels.some(function(l) { return otherLevels.includes(l); });
        if (overlap) {
          toastWarning('"' + (others[oi].name || 'Another resume') + '" already covers ' + levelLabel + ' on filter "' + fname + '".');
          return;
        }
      }
    }
    r.levelLabels.push(levelLabel);
  }
  // Keep backward compat: levelLabel = first assigned or empty
  r.levelLabel = r.levelLabels[0] || '';
  const levels = (safeReadLS('bj_tuning', {}).levelHierarchy || []);
  const lvl = levels.find(l => l.label === r.levelLabel);
  r.levelColor = lvl?.color || '#94a3b8';
  saveResumes();
  renderResumes();
  // Re-open panel
  if (_activeResumePanel >= 0) {
    var panel = document.getElementById('ai-panel-' + _activeResumePanel);
    var row = document.getElementById('nri-' + _activeResumePanel);
    if (panel) panel.classList.add('open');
    if (row) row.classList.add('selected');
  }
};

// Backward compat alias
window.setResumeLevel = function(idx, selectEl) {
  var val = selectEl.value;
  toggleResumeLevel(idx, val);
};

window.archiveResume = async function(idx) {
  if (!confirm(`Archive "${resumes[idx].name}"? It will be moved to the archive section.`)) return;
  // Write to Supabase first (source of truth) — only update local state on success
  if (resumes[idx].archiveId && typeof sb !== 'undefined') {
    try {
      const { error } = await sb.from('resume_archive')
        .update({ is_active: false, is_archived: true, archived_at: new Date().toISOString() })
        .eq('resume_id', resumes[idx].archiveId);
      if (error) { showToast('Failed to archive — please try again.', { type: 'error' }); console.error('[resume-sync] Archive DB write failed:', error); return; }
    } catch (e) { showToast('Failed to archive — please try again.', { type: 'error' }); reportError('resumes', e); console.error('[resume-sync] Archive DB write exception:', e); return; }
  }
  resumes[idx].archived = true;
  resumes[idx].archivedAt = new Date().toLocaleDateString();
  resumes[idx]._archivedLocallyAt = Date.now();
  saveResumes();
  renderResumes();
};

window.unarchiveResume = async function(idx) {
  // Write to Supabase first (source of truth) — only update local state on success
  if (resumes[idx].archiveId && typeof sb !== 'undefined') {
    try {
      const { error } = await sb.from('resume_archive')
        .update({ is_active: true, is_archived: false, archived_at: null })
        .eq('resume_id', resumes[idx].archiveId);
      if (error) { showToast('Failed to restore — please try again.', { type: 'error' }); console.error('[resume-sync] Restore DB write failed:', error); return; }
    } catch (e) { showToast('Failed to restore — please try again.', { type: 'error' }); reportError('resumes', e); console.error('[resume-sync] Restore DB write exception:', e); return; }
  }
  resumes[idx].archived = false;
  delete resumes[idx].archivedAt;
  resumes[idx]._archivedLocallyAt = Date.now();
  saveResumes();
  renderResumes();
};

// ─── Resume Archive Reconciliation ───
// Syncs localStorage bj_resumes ↔ Supabase resume_archive on page load.
// resume_archive is the source of truth for metadata; localStorage is cache.
async function reconcileResumeArchive() {
  if (typeof sb === 'undefined' || !currentUser) return;
  try {
    var userId = currentUser.id;
    var { data: archiveRows, error } = await sb
      .from('resume_archive')
      .select('resume_id, display_name, storage_path, is_active, is_archived, file_size_bytes, file_type, created_at')
      .eq('user_id', userId);
    if (error || !archiveRows) { console.warn('[resume-sync] Failed to fetch archive:', error); return; }

    // Build lookup: storage_path → archive row
    var byPath = {};
    var byName = {};
    archiveRows.forEach(function(row) {
      if (row.storage_path) byPath[row.storage_path] = row;
      if (row.display_name) {
        var key = row.display_name.toLowerCase();
        if (!byName[key]) byName[key] = row;
      }
    });

    // Track which archive rows got matched
    var matchedArchiveIds = {};
    var dirty = false;

    // Step 1: Link localStorage resumes to archive rows
    resumes.forEach(function(r) {
      var match = null;
      if (r.storagePath && byPath[r.storagePath]) {
        match = byPath[r.storagePath];
      } else if (r.name && byName[r.name.toLowerCase()]) {
        match = byName[r.name.toLowerCase()];
      }
      if (match) {
        if (r.archiveId !== match.resume_id) {
          r.archiveId = match.resume_id;
          dirty = true;
        }
        matchedArchiveIds[match.resume_id] = true;
        // Sync archive state → localStorage (skip if recently changed locally)
        const recentlyChanged = r._archivedLocallyAt && (Date.now() - r._archivedLocallyAt) < 60000;
        if (!recentlyChanged) {
          if (match.is_archived && !r.archived) {
            r.archived = true;
            r.archivedAt = match.created_at ? new Date(match.created_at).toLocaleDateString() : new Date().toLocaleDateString();
            dirty = true;
          } else if (!match.is_archived && match.is_active && r.archived) {
            r.archived = false;
            delete r.archivedAt;
            dirty = true;
          }
        }
      }
    });

    // Step 2: Insert unmatched localStorage resumes into resume_archive
    var unmatched = resumes.filter(function(r) { return !r.archiveId && r.storagePath; });
    for (var i = 0; i < unmatched.length; i++) {
      var r = unmatched[i];
      var sizeBytes = 0;
      var sizeMatch = (r.size || '').match(/([\d.]+)\s*(KB|MB)/i);
      if (sizeMatch) {
        sizeBytes = parseFloat(sizeMatch[1]) * (sizeMatch[2].toUpperCase() === 'MB' ? 1048576 : 1024);
      }
      var { data: inserted, error: insErr } = await sb.from('resume_archive').insert({
        user_id: userId,
        display_name: r.name || r.fileName || 'Untitled',
        file_hash: r.id || '',
        file_size_bytes: Math.round(sizeBytes) || 0,
        file_type: /\.pdf$/i.test(r.fileName || '') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storage_path: r.storagePath,
        is_active: !r.archived,
        is_archived: !!r.archived
      }).select('resume_id').single();
      if (!insErr && inserted) {
        r.archiveId = inserted.resume_id;
        dirty = true;
        console.log('[resume-sync] Inserted into archive:', r.name);
        // v6.04: Mark onboarding milestone
        if (typeof markOnboardingMilestone === 'function') markOnboardingMilestone('resume');
      }
    }

    // Step 3: Pull active archive rows not in localStorage
    archiveRows.forEach(function(row) {
      if (matchedArchiveIds[row.resume_id]) return;
      if (!row.is_active || row.is_archived) return;
      // Active resume in DB but missing from localStorage — create stub
      var stub = {
        id: 'res_sync_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        name: row.display_name || 'Synced Resume',
        fileName: row.display_name || 'synced-resume',
        size: row.file_size_bytes ? (row.file_size_bytes < 1048576 ? Math.round(row.file_size_bytes / 1024) + ' KB' : (row.file_size_bytes / 1048576).toFixed(1) + ' MB') : '—',
        filterIds: [],
        uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
        levelLabel: '',
        levelColor: '',
        archived: false,
        extractedText: '',
        keywords: [],
        textStatus: 'needs-reextract',
        storagePath: row.storage_path,
        archiveId: row.resume_id
      };
      resumes.push(stub);
      dirty = true;
      console.log('[resume-sync] Pulled from archive:', row.display_name);
    });

    if (dirty) {
      saveResumes();
      renderResumes();
      console.log('[resume-sync] Reconciliation complete — synced ' + resumes.length + ' resumes');
    }
  } catch(e) { reportError('resumes', e); console.warn('[resume-sync] Reconciliation error:', e);
  }
}

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
    reportError('resumes', e);
    console.error('[BJ] PDF text extraction failed:', e);
    if (typeof toastWarning === 'function') toastWarning('Could not extract text from PDF. Try re-uploading or use a different file format.');
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
    reportError('resumes', e);
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
  const sf = safeReadLS('bj_saved_filters', []);
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
    } catch(e) { reportError('resumes', e); console.error('[BJ] Re-extraction error for', r.name, e);
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
  bjFileStore.put(id, file).catch(e => { reportError('resumes', e); console.warn('[BJ] File store error:', e); });

  // Upload to Supabase Storage for cross-device persistence
  if (currentUser) {
    const storagePath = currentUser.id + '/' + id + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    sb.storage.from('resumes').upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'application/octet-stream'
    }).then(({ data, error }) => {
      if (error) { console.warn('[resume-storage] Upload failed:', error.message); return; }
      const idx = resumes.findIndex(r => r.id === id);
      if (idx >= 0) {
        resumes[idx].storagePath = storagePath;
        saveResumes();
        console.log('[resume-storage] Uploaded', storagePath);
      }
    }).catch(e => { reportError('resumes', e); console.warn('[resume-storage] Upload error:', e.message); });
  }

  extractTextFromFile(file).then(text => {
    const idx = resumes.findIndex(r => r.id === id);
    if (idx < 0) return;
    resumes[idx].extractedText = text;
    resumes[idx].keywords = extractResumeKeywords(text);
    resumes[idx].textStatus = text ? 'ready' : 'no-text';
    saveResumes();
    renderResumes();
    // Persist extracted text to DB so it survives browser storage clears
    if (text && text.length >= 100) {
      persistResumeTextToDB(id, text);
      scoreResumeAI(id, text);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// v6.38: AI Content Scoring for Resumes (Session 2.1)
// Calls score-ai-content EF after text extraction
// ═══════════════════════════════════════════════════════════

async function scoreResumeAI(resumeId, text) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { console.warn('[ai-score] No session, skipping resume scoring'); return; }

    const idx = resumes.findIndex(r => r.id === resumeId);
    if (idx < 0) return;

    // Set scoring state
    resumes[idx].aiScoreStatus = 'scoring';
    renderResumes();

    const resp = await fetch(SUPABASE_URL + '/functions/v1/score-ai-content', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        items: [{
          content_type: 'resume',
          content_id: resumeId,
          text: text.substring(0, 8000),
        }]
      }),
    });

    if (!resp.ok) {
      console.warn('[ai-score] Resume scoring failed:', resp.status);
      resumes[idx].aiScoreStatus = 'error';
      saveResumes();
      renderResumes();
      return;
    }

    const data = await resp.json();
    const result = data.results && data.results[0];

    if (result) {
      resumes[idx].aiScore = {
        score: result.ai_generated_score,
        label: result.ai_label,
        confidence: result.confidence,
        summary: result.summary,
        topSignals: result.top_signals || [],
        scoredAt: new Date().toISOString(),
      };
      resumes[idx].aiScoreStatus = 'done';

      // PostHog event: ai_resume_scored
      if (typeof posthog !== 'undefined') {
        posthog.capture('ai_resume_scored', {
          resume_id: resumeId,
          ai_label: result.ai_label,
          ai_score: result.ai_generated_score,
          confidence: result.confidence,
          text_length: text.length,
        });
      }
    } else {
      resumes[idx].aiScoreStatus = 'error';
    }

    saveResumes();
    renderResumes();
    console.log('[ai-score] Resume scored:', resumeId, result?.ai_label, result?.ai_generated_score);
  } catch (e) {
    reportError('resumes', e);
    console.warn('[ai-score] Resume scoring error:', e.message);
    const idx = resumes.findIndex(r => r.id === resumeId);
    if (idx >= 0) {
      resumes[idx].aiScoreStatus = 'error';
      saveResumes();
      renderResumes();
    }
  }
}

// v6.39: Rescore with rate limiting, cooldown, and score history
var RESCORE_COOLDOWN_MS = 60000; // 60-second cooldown between rescores
window.rescoreResumeAI = function(idx) {
  const r = resumes[idx];
  if (!r || !r.extractedText || r.extractedText.length < 100) {
    showToast('Resume text too short for AI scoring', { type: 'warning' });
    return;
  }
  // Rate limit check
  if (r._rescoreCooldownUntil && Date.now() < r._rescoreCooldownUntil) {
    const wait = Math.ceil((r._rescoreCooldownUntil - Date.now()) / 1000);
    showToast('Please wait ' + wait + 's before rescoring again', { type: 'info' });
    return;
  }
  // Save current score to history before rescoring
  if (r.aiScore && r.aiScore.label) {
    if (!r.aiScoreHistory) r.aiScoreHistory = [];
    r.aiScoreHistory.push({
      label: r.aiScore.label,
      score: r.aiScore.score,
      confidence: r.aiScore.confidence,
      summary: r.aiScore.summary,
      scoredAt: new Date().toISOString()
    });
    // Keep last 5 scores max
    if (r.aiScoreHistory.length > 5) r.aiScoreHistory = r.aiScoreHistory.slice(-5);
    saveResumes();
  }
  // Set cooldown
  r._rescoreCooldownUntil = Date.now() + RESCORE_COOLDOWN_MS;
  // Disable button immediately
  const btn = document.getElementById('rescore-btn-' + idx);
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
    btn.title = 'Rescoring…';
    btn.innerHTML = '<i data-lucide="refresh-cw" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;animation:spin 1s linear infinite;"></i> Rescoring…'; if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }
  // Start cooldown countdown
  _startRescoreCooldown(idx);
  scoreResumeAI(r.id, r.extractedText);
};

// v6.39: Cooldown timer for rescore button
function _startRescoreCooldown(idx) {
  const interval = setInterval(function() {
    const r = resumes[idx];
    const btn = document.getElementById('rescore-btn-' + idx);
    if (!r || !btn) { clearInterval(interval); return; }
    const remaining = r._rescoreCooldownUntil ? r._rescoreCooldownUntil - Date.now() : 0;
    if (remaining <= 0) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.title = 'Re-analyze for AI content';
      btn.innerHTML = '<i data-lucide="refresh-cw" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;"></i> Rescore'; if (typeof window.refreshIcons === 'function') window.refreshIcons();
      clearInterval(interval);
    } else {
      const sec = Math.ceil(remaining / 1000);
      btn.title = 'Cooldown: wait ' + sec + 's';
      btn.innerHTML = '<i data-lucide="refresh-cw" class="icon-xs icon-stroke" style="display:inline-block;vertical-align:middle;"></i> ' + sec + 's'; if (typeof window.refreshIcons === 'function') window.refreshIcons();
    }
  }, 1000);
}

// v6.39: Button handler (calls rescoreResumeAI)
window.handleRescore = function(idx) {
  window.rescoreResumeAI(idx);
};

window.toggleResumeKeywords = function(idx) {
  const el = document.getElementById(`rc-kw-${idx}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
};

// Row click → expand/collapse AI analysis panel (only one at a time)
var _activeResumePanel = -1;
window.toggleResumePanel = function(idx, event) {
  // Don't toggle if clicking action buttons or inputs
  if (event && event.target.closest('.nri-actions, select, button, input, .rc-filter-pill')) return;

  const panel = document.getElementById('ai-panel-' + idx);
  const row = document.getElementById('nri-' + idx);
  if (!panel || !row) return;

  if (_activeResumePanel === idx) {
    // Collapse current
    panel.classList.remove('open');
    row.classList.remove('selected');
    _activeResumePanel = -1;
  } else {
    // Collapse previous
    if (_activeResumePanel >= 0) {
      var prevPanel = document.getElementById('ai-panel-' + _activeResumePanel);
      var prevRow = document.getElementById('nri-' + _activeResumePanel);
      if (prevPanel) prevPanel.classList.remove('open');
      if (prevRow) prevRow.classList.remove('selected');
    }
    // Expand new
    panel.classList.add('open');
    row.classList.add('selected');
    _activeResumePanel = idx;

    // Track PostHog event
    if (typeof posthog !== 'undefined') {
      posthog.capture('resume_panel_expanded', { resume_index: idx, resume_name: resumes[idx]?.name });
    }
  }
};

window.renameResume = function(idx) {
  const current = resumes[idx].name;
  const input = prompt('Resume name:', current);
  if (input === null || !input.trim()) return;
  resumes[idx].name = input.trim();
  saveResumes();
  renderResumes();
};

// Delete confirmation flow — offers download before permanent deletion
window.confirmDeleteResume = function(idx) {
  var r = resumes[idx];
  if (!r) return;

  // Check if Google Drive is connected
  var gdrive;
  try { gdrive = safeReadLS('bj_gdrive', {}); } catch(e) { gdrive = {}; }
  var gdriveConnected = gdrive && gdrive.connected;

  // Build modal
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  var modal = document.createElement('div');
  modal.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.3);';

  var title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;';
  title.textContent = 'Delete "' + (r.name || 'Resume') + '"?';

  var desc = document.createElement('div');
  desc.style.cssText = 'font-size:13px;color:var(--text-dim);line-height:1.6;margin-bottom:20px;';
  desc.textContent = 'This will permanently remove this resume and all associated data. Would you like to save a copy first?';

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  // Save to Google Drive button (if connected)
  if (gdriveConnected) {
    var gdriveBtn = document.createElement('button');
    gdriveBtn.className = 'btn btn-sm';
    gdriveBtn.style.cssText = 'background:var(--green);color:#fff;border:none;padding:8px 16px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;';
    gdriveBtn.innerHTML = '<i data-lucide="hard-drive-download" class="icon-sm icon-stroke"></i> Save to Google Drive & Delete';
    gdriveBtn.onclick = function() {
      downloadResume(idx);
      overlay.remove();
      setTimeout(function() { removeResume(idx); }, 500);
    };
    btnRow.appendChild(gdriveBtn);
  }

  // Download to desktop button
  var downloadBtn = document.createElement('button');
  downloadBtn.className = 'btn btn-sm';
  downloadBtn.style.cssText = 'background:var(--accent);color:#fff;border:none;padding:8px 16px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;display:flex;align-items:center;gap:6px;';
  downloadBtn.innerHTML = '<i data-lucide="download" class="icon-sm icon-stroke"></i>' + (gdriveConnected ? ' Download & Delete' : ' Save to Desktop & Delete');
  downloadBtn.onclick = function() {
    downloadResume(idx);
    overlay.remove();
    setTimeout(function() { removeResume(idx); }, 500);
  };
  btnRow.appendChild(downloadBtn);

  // Delete without saving
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-sm';
  deleteBtn.style.cssText = 'background:var(--red);color:#fff;border:none;padding:8px 16px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;';
  deleteBtn.textContent = 'Delete Without Saving';
  deleteBtn.onclick = function() {
    overlay.remove();
    removeResume(idx);
  };
  btnRow.appendChild(deleteBtn);

  // Cancel
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-sm btn-secondary';
  cancelBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:8px;cursor:pointer;margin-inline-start:auto;';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = function() { overlay.remove(); };
  btnRow.appendChild(cancelBtn);

  modal.appendChild(title);
  modal.appendChild(desc);
  modal.appendChild(btnRow);
  overlay.appendChild(modal);
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
};

window.removeResume = function(idx) {
  // Clean up stored file from IndexedDB and Storage
  bjFileStore.delete(resumes[idx].id).catch(() => {});
  if (resumes[idx].storagePath && currentUser) {
    sb.storage.from('resumes').remove([resumes[idx].storagePath]).catch(() => {});
  }
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
    let file = await bjFileStore.get(r.id);
    // Fall back to Supabase Storage if IndexedDB doesn't have the file
    if (!file && r.storagePath && currentUser) {
      try {
        const { data: blob, error } = await sb.storage.from('resumes').download(r.storagePath);
        if (!error && blob) {
          file = blob;
          // Re-cache in IndexedDB for next time
          bjFileStore.put(r.id, blob).catch(() => {});
          console.log('[resume-storage] Restored from cloud:', r.storagePath);
        }
      } catch(e) { reportError('resumes', e); console.warn('[resume-storage] Download failed:', e.message); }
    }
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
      showToast('File not available. Re-upload this resume to restore the file.', { type: 'error' });
    }
  } catch(e) {
    showToast('Download failed: ' + e.message, { type: 'error' });
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
    // Upload replacement file to Storage
    if (currentUser) {
      var rePath = currentUser.id + '/' + resumes[idx].id + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      sb.storage.from('resumes').upload(rePath, file, { cacheControl: '3600', upsert: true, contentType: file.type || 'application/octet-stream' })
        .then(function(res) { if (!res.error) { resumes[idx].storagePath = rePath; saveResumes(); } });
    }
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
    bjFileStore.put(resumes[idx].id, file).catch(e => { reportError('resumes', e); console.warn('[BJ] File store error:', e); });

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
function handleResumeFileInput() {
  var inp = $('#resume-file-input');
  if (inp && inp.files) {
    Array.from(inp.files).forEach(f => addResume(f));
    inp.value = '';
  }
}

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
  resumeInput.addEventListener('change', handleResumeFileInput);
}

renderResumes();

// Create by Level — scaffold resume placeholders for each level in the hierarchy
$('#resume-from-level-btn')?.addEventListener('click', async () => {
  const levels = safeReadLS('bj_tuning', {}).levelHierarchy || [];
  if (levels.length === 0) {
    showToast('No title levels configured. Go to Search Tuning → Title Level Hierarchy to set up your levels first.', { type: 'info' });
    return;
  }

  const existingNames = resumes.filter(r => !r.archived).map(r => r.name.toLowerCase());
  const newLevels = levels.filter(l => l.label && !existingNames.includes(l.label.toLowerCase() + ' resume'));

  if (newLevels.length === 0) {
    showToast('You already have resume placeholders for all configured levels.', { type: 'info' });
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

// Reconcile localStorage ↔ Supabase resume_archive on load
setTimeout(() => {
  if (typeof currentUser !== 'undefined' && currentUser) {
    reconcileResumeArchive();
  } else {
    // Wait for auth
    var waitAuth = setInterval(() => {
      if (typeof currentUser !== 'undefined' && currentUser) {
        clearInterval(waitAuth);
        reconcileResumeArchive();
      }
    }, 500);
    setTimeout(() => clearInterval(waitAuth), 8000);
  }
}, 800);

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
// ════════════════════════════════════════════════════════════
// LAUNCH REWRITE INTERVIEW FROM RESUME ROW
// ════════════════════════════════════════════════════════════

window.launchRewriteInterview = function(idx) {
  var r = resumes[idx];
  if (!r || r.archived) { showToast('Resume not found.', { type: 'error' }); return; }

  // Check extracted text
  if (!r.extractedText || r.extractedText.length < 50) {
    showToast('Resume text not ready. Please wait for extraction to complete.', { type: 'error', duration: 4000 });
    return;
  }

  // Find assigned filters
  var assignedFilters = [];
  if (r.filterAssignments) {
    for (var key in r.filterAssignments) {
      if (r.filterAssignments[key]) assignedFilters.push(key);
    }
  }

  if (assignedFilters.length === 0) {
    showToast('Assign this resume to a filter first so we know which roles to target.', { type: 'error', duration: 5000 });
    return;
  }

  // Find the weakest filter (lowest readiness score) for max rewrite impact
  var targetFilterName = assignedFilters[0];
  var lowestScore = 999;
  if (readinessCache && readinessCache.scores && readinessCache.scores[idx]) {
    var filterScores = readinessCache.scores[idx].filters || {};
    for (var fn in filterScores) {
      if (assignedFilters.indexOf(fn) >= 0 && filterScores[fn].score < lowestScore) {
        lowestScore = filterScores[fn].score;
        targetFilterName = fn;
      }
    }
  }

  // Find a representative job from this filter's loaded feed
  var targetJobId = null;
  var targetJobTitle = null;
  var targetCompany = null;

  // Try feedCache first (loaded jobs from the jobs tab)
  if (window.feedCache && Array.isArray(window.feedCache)) {
    var filterObj = savedFilters.find(function(f){ return f.name === targetFilterName; });
    if (filterObj) {
      // Find a job from this filter
      for (var j = 0; j < window.feedCache.length; j++) {
        var job = window.feedCache[j];
        if (job && job.id) {
          targetJobId = job.id;
          targetJobTitle = job.title || 'Target Role';
          targetCompany = job.company || '';
          break;
        }
      }
    }
  }

  // Fallback: use first job from jdCache (locally cached JDs from readiness analysis)
  if (!targetJobId && window.jdCache) {
    var jdKeys = Object.keys(window.jdCache);
    if (jdKeys.length > 0) {
      targetJobId = jdKeys[0];
      var jd = window.jdCache[jdKeys[0]];
      targetJobTitle = (jd && jd.title) || 'Target Role';
      targetCompany = (jd && jd.company) || '';
    }
  }

  if (!targetJobId) {
    showToast('No job data loaded for this filter yet. Run a readiness analysis first, then try again.', { type: 'error', duration: 5000 });
    return;
  }

  var matchScore = lowestScore < 999 ? lowestScore : null;

  // Open the existing rewrite panel
  if (typeof openRewritePanel === 'function') {
    openRewritePanel(targetJobId, targetJobTitle, targetCompany, r.id, matchScore);
    if (typeof posthog !== 'undefined') {
      posthog.capture('rewrite_interview_launched', {
        resume_index: idx,
        resume_name: r.name,
        target_filter: targetFilterName,
        match_score: matchScore
      });
    }
  } else {
    showToast('Rewrite module not loaded. Please refresh the page.', { type: 'error' });
  }
};

// ============================================================
// REJECTION GAP ANALYSIS — v7.07
// Phase A: Data collection trigger
// Phase B: Insight surfacing on Resumes page
// ============================================================

/**
 * triggerGapAnalysis — called when user marks application ghosted or rejected.
 * Invokes analyze-application-gap edge function.
 * @param {string} jobId - ats_jobs greenhouse_id or composite key
 * @param {string|null} resumeId - resume_archive resume_id (uuid)
 * @param {string} outcome - 'ghosted' or 'rejected'
 */
window.triggerGapAnalysis = async function(jobId, resumeId, outcome) {
  if (!currentUser) return;
  if (!['ghosted', 'rejected'].includes(outcome)) return;

  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;

    var resp = await fetch(
      'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/analyze-application-gap',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
        },
        body: JSON.stringify({ job_id: jobId, resume_id: resumeId, outcome: outcome }),
      }
    );

    var result = await resp.json();
    if (result.ok) {
      console.log('[BJ] Gap analysis recorded — ' + (result.gap_term_count || 0) + ' gap terms');
    }
  } catch (e) {
    reportError('resumes', e);
    console.warn('[BJ] Gap analysis error (non-fatal):', e.message);
  }
};

/**
 * renderGapInsights — loads and renders the Patterns section on the Resumes page.
 * Shows top gap terms if user has >= 5 records; placeholder otherwise.
 */
window.renderGapInsights = async function() {
  var container = document.getElementById('gap-insights-section');
  if (!container) return;
  if (!currentUser) { container.style.display = 'none'; return; }

  try {
    // Fire PostHog view event
    if (typeof posthog !== 'undefined') {
      posthog.capture('gap_insights_viewed', { user_id: currentUser.id });
    }

    var { data: rows, error } = await sb.rpc('get_gap_insights', {
      p_user_id: currentUser.id,
      p_days: 90,
      p_limit: 10,
    });

    if (error) throw new Error(error.message);

    // Check total gap record count for threshold gate
    var { count: totalCount } = await sb
      .from('application_gaps')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id);

    var contentEl = document.getElementById('gap-insights-content');
    if (!contentEl) return;

    if (!totalCount || totalCount < 5) {
      contentEl.innerHTML = '<p style="color:var(--text-faint);font-size:12px;margin:0;">Apply to more jobs and mark outcomes to unlock pattern analysis. (' + (totalCount || 0) + '/5 applications recorded)</p>';
      container.style.display = '';
      return;
    }

    if (!rows || rows.length === 0) {
      contentEl.innerHTML = '<p style="color:var(--text-faint);font-size:12px;margin:0;">No gap patterns detected yet. Keep marking application outcomes.</p>';
      container.style.display = '';
      return;
    }

    // Render top terms
    var html = '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    rows.forEach(function(row) {
      html += '<div onclick="window.onGapTermClick(' + JSON.stringify(row.term) + ')" style="cursor:pointer;background:var(--bg-input);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:11px;color:var(--text-dim);transition:border-color 0.15s;" title="Click to add to keyword suggestions">' +
        '<span style="color:var(--text);">' + row.term + '</span>' +
        '<span style="color:var(--text-faint);margin-left:6px;">×' + row.frequency + '</span>' +
        '</div>';
    });
    html += '</div>';

    contentEl.innerHTML = html;
    container.style.display = '';

  } catch(e) { reportError('resumes', e); console.warn('[BJ] renderGapInsights error:', e.message);
  }
};

/**
 * onGapTermClick — placeholder for future click-to-add resume keyword injection.
 */
window.onGapTermClick = function(term) {
  if (typeof posthog !== 'undefined') {
    posthog.capture('gap_term_clicked', { term: term, user_id: currentUser && currentUser.id });
  }
  // Future: inject term into resume keyword suggestions editor
  if (typeof showToast === 'function') {
    showToast('"' + term + '" noted — resume keyword injection coming soon.', { duration: 2500 });
  }
};

// QA-FIX: Expose text extraction for AI filter generation (used by location.js)
window._extractTextFromFile = extractTextFromFile;
window._bjFileStore = bjFileStore;

// CS-P1-004 FE-005: Register resumes.js exports with BJ namespace
(function() {
  var exports = [
    'toggleResumeFilter', 'setResumeLevel', 'toggleResumeLevel', 'archiveResume', 'unarchiveResume',
    'rescoreResumeAI', 'handleRescore', 'toggleResumeKeywords', 'toggleResumePanel',
    'renameResume', 'confirmDeleteResume', 'removeResume', 'downloadResume',
    'replaceResumePlaceholder', 'reUploadResume', 'launchRewriteInterview',
    'triggerGapAnalysis', 'renderGapInsights', 'onGapTermClick',
    'clearAllFilters', 'openAssignPopover'
  ];
  exports.forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'resumes', registered: Date.now() };
    }
  });
})();


// === js/applications.js ===
// ============================================================
// APPLICATIONS — Flow Management
// ============================================================
let appQueue = safeReadLS('bj_app_queue', []);
let appHistory = safeReadLS('bj_app_history', []);
let appMode = localStorage.getItem('bj_app_mode') || 'manual';

// ============================================================
// SETTINGS PANEL — Rules & Notifications
// ============================================================

window.toggleAppSettings = function() {
  var panel = document.getElementById('app-settings-panel');
  var btn = document.getElementById('app-settings-toggle');
  if (!panel) return;
  var isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.classList.toggle('active', !isOpen);
  if (!isOpen) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.switchSettingsTab = function(tab) {
  document.querySelectorAll('.app-settings-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.settings === tab);
  });
  var rulesEl = document.getElementById('settings-content-rules');
  var notifEl = document.getElementById('settings-content-notifications');
  if (rulesEl) rulesEl.style.display = tab === 'rules' ? 'block' : 'none';
  if (notifEl) notifEl.style.display = tab === 'notifications' ? 'block' : 'none';
};

// Mode selection
$$('.app-mode-select').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.app-mode-select').forEach(b => {
      b.classList.remove('active');
      b.className = b.className.replace(/btn-primary/g, 'btn-secondary');
      b.style.border = '';
      const sub = b.querySelector('div:last-child');
      if (sub) sub.style.color = 'var(--text-dim)';
    });
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    const activeSub = btn.querySelector('div:last-child');
    if (activeSub) activeSub.style.color = 'rgba(255,255,255,0.85)';
    appMode = btn.dataset.mode;
    localStorage.setItem('bj_app_mode', appMode);
  });
});

// Set active mode on load
$$('.app-mode-select').forEach(btn => {
  const sub = btn.querySelector('div:last-child');
  if (btn.dataset.mode === appMode) {
    btn.classList.add('active');
    btn.className = btn.className.replace(/btn-secondary/g, 'btn-primary');
    btn.style.border = '2px solid var(--accent)';
    if (sub) sub.style.color = 'rgba(255,255,255,0.85)';
  } else {
    btn.classList.remove('active');
    btn.className = btn.className.replace(/btn-primary/g, 'btn-secondary');
    btn.style.border = '';
    if (sub) sub.style.color = 'var(--text-dim)';
  }
});

function modeBadge(mode) {
  const map = { manual: 'mode-manual', auto: 'mode-auto', notify: 'mode-notify' };
  const labels = { manual: 'Manual', auto: 'Auto', notify: 'Notify' };
  return `<span class="app-mode-badge ${map[mode] || 'mode-manual'}">${labels[mode] || mode}</span>`;
}

function statusBadge(status) {
  const map = { queued: 'status-queued', pending: 'status-pending', sent: 'status-sent', submitted: 'status-submitted', failed: 'status-failed' };
  const labels = { queued: 'Queued', pending: 'Pending Approval', sent: 'Notification Sent', submitted: 'Submitted', failed: 'Failed' };
  return `<span class="app-status-badge ${map[status] || 'status-queued'}">${labels[status] || status}</span>`;
}

function renderAppQueue() {
  const tbody = $('#app-queue-body');
  const navBadge = $('#nav-app-count');

  // Update stat cards
  const queued = appQueue.filter(a => a.status === 'queued').length;
  const pending = appQueue.filter(a => a.status === 'pending' || a.status === 'sent').length;
  const submitted = [...appQueue, ...appHistory].filter(a => a.status === 'submitted').length;
  const failed = [...appQueue, ...appHistory].filter(a => a.status === 'failed').length;
  const _el = id => document.getElementById(id);
  if (_el('a-queued')) _el('a-queued').textContent = queued;
  if (_el('a-submitted')) _el('a-submitted').textContent = submitted;
  // FB-APPS-001: Update queue section visibility in Pipeline tab
  if (typeof updateQueueSectionVisibility === 'function') updateQueueSectionVisibility();

  // Hero lifecycle stats
  const allApps = (typeof appHistory !== 'undefined' && Array.isArray(appHistory)) ? [...appQueue, ...appHistory] : [...appQueue];
  const totalSent = allApps.filter(a => a.status === 'submitted').length;
  const responded = allApps.filter(a =>
    a.ghostStatus === 'responded' || a.pipelineStage === 'responded' ||
    a.pipelineStage === 'interview' || a.pipelineStage === 'offer'
  ).length;
  if (_el('a-response-rate')) {
    _el('a-response-rate').textContent = totalSent > 0
      ? Math.round((responded / totalSent) * 100) + '%'
      : '—';
  }
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek = allApps.filter(a =>
    a.status === 'submitted' && new Date(a.submittedAt || a.addedAt).getTime() > weekAgo
  ).length;
  if (_el('a-this-week')) _el('a-this-week').textContent = thisWeek;

  // Cross-tab ghost intel
  const ghostStale = allApps.filter(a => {
    if (a.status !== 'submitted') return false;
    const days = (Date.now() - new Date(a.submittedAt || a.addedAt).getTime()) / 86400000;
    return days > 7;
  });
  const intelSlot = document.getElementById('app-intel-slot');
  const intelTitle = document.getElementById('app-intel-title');
  const intelSub = document.getElementById('app-intel-sub');
  if (intelSlot && intelTitle && ghostStale.length > 0 && thisWeek > 0) {
    intelTitle.textContent = 'You sent ' + thisWeek + ' application' + (thisWeek !== 1 ? 's' : '') + ' this week — ' + ghostStale.length + ' ' + (ghostStale.length === 1 ? 'is' : 'are') + ' past the 7-day mark with no response.';
    intelSub.textContent = 'Review stale applications and take action before they go cold.';
    intelSlot.style.display = '';
  }

  if (navBadge && appQueue.length > 0) {
    navBadge.style.display = '';
    navBadge.textContent = appQueue.length;
  }

  // Enable process button if items exist
  const processBtn = $('#a-process-queue');
  processBtn.disabled = appQueue.filter(a => a.status === 'queued').length === 0;

  if (appQueue.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="margin-bottom:12px;color:var(--text-faint);"><i data-lucide="mail" class="icon-xl icon-stroke-lg" style="opacity:0.25;"></i></div>
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No applications queued</div>
      <div style="font-size:12px;max-width:360px;margin:0 auto;line-height:1.5;">
        Add jobs manually, or save jobs from Discovery to auto-queue them based on your rules.
      </div>
    </td></tr>`;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
    return;
  }

  tbody.innerHTML = appQueue.map((app, i) => `
    <tr>
      <td><input type="checkbox" class="a-row-check" data-idx="${i}"></td>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.addedAt}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="removeFromQueue(${i})" style="padding:4px 8px;font-size:11px;color:var(--red);">✕</button>
      </td>
    </tr>
  `).join('');
}

function renderAppHistory() {
  const tbody = $('#app-history-body');
  if (!tbody) return; // APR-001: history tab removed, element no longer in DOM
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:48px 12px;">
      <div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No application history yet</div>
      <div style="font-size:12px;">Completed applications will appear here with full audit trail.</div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = appHistory.map(app => `
    <tr>
      <td style="font-weight:600;color:var(--text);">${app.jobTitle}</td>
      <td>${app.company}</td>
      <td style="font-size:12px;">${app.resumeName || '—'}</td>
      <td>${modeBadge(app.mode)}</td>
      <td>${statusBadge(app.status)}</td>
      <td style="font-size:12px;color:var(--text-faint);">${app.submittedAt || '—'}</td>
      <td style="font-size:12px;">${app.source || '—'}</td>
    </tr>
  `).join('');
}

// Manual add to queue
$('#a-add-manual').addEventListener('click', () => {
  const title = prompt('Job title:');
  if (!title) return;
  const company = prompt('Company:');
  if (!company) return;
  const url = prompt('Application URL (optional):') || '';

  const firstResume = resumes.find(r => !r.archived && !r.needsUpload);
  appQueue.push({
    id: 'app_' + Date.now(),
    jobTitle: title,
    company: company,
    url: url,
    resumeName: firstResume ? firstResume.name : '',
    resumeId: firstResume ? firstResume.id : '',
    mode: appMode,
    status: appMode === 'auto' ? 'queued' : (appMode === 'notify' ? 'pending' : 'queued'),
    addedAt: new Date().toLocaleDateString(),
    source: 'manual'
  });
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
});

// Process queue — EXT-AS-7: Route through headless worker
$('#a-process-queue').addEventListener('click', () => {
  // AF-002: Setup gate — block if setup not complete
  if (typeof isSetupComplete === 'function' && !isSetupComplete()) {
    if (typeof showSetupGateModal === 'function') showSetupGateModal();
    else if (typeof showToast === 'function') showToast('Complete your application profile before submitting.', { type: 'warning' });
    return;
  }
  // Use Supabase-backed processApplyQueueByMode from apply-workflow.js (AF-004)
  if (typeof processApplyQueueByMode === 'function') {
    processApplyQueueByMode();
    return;
  }
  // Fallback: legacy processApplyQueue (EXT-AS-7)
  if (typeof processApplyQueue === 'function') {
    processApplyQueue();
    return;
  }
  // Fallback: legacy localStorage queue
  let processed = 0;
  appQueue.forEach(app => {
    if (app.status !== 'queued') return;
    if (app.mode === 'auto') {
      app.status = 'submitted';
      app.submittedAt = new Date().toLocaleDateString();
      processed++;
    } else if (app.mode === 'notify') {
      app.status = 'sent';
      processed++;
    } else {
      // Manual — mark as pending user action
      app.status = 'pending';
      processed++;
    }
  });

  // Move submitted ones to history
  const submitted = appQueue.filter(a => a.status === 'submitted');
  appHistory.push(...submitted);
  appQueue = appQueue.filter(a => a.status !== 'submitted');

  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  saveUserData('bj_app_history', JSON.stringify(appHistory));
  renderAppQueue();
  renderAppHistory();

  if (processed > 0) {
    alert(`Processed ${processed} application(s).\n\n` +
      (submitted.length > 0 ? `${submitted.length} auto-submitted.\n` : '') +
      (appQueue.filter(a => a.status === 'sent').length > 0 ? `Notifications sent — awaiting your approval.\n` : '') +
      (appQueue.filter(a => a.status === 'pending').length > 0 ? `Manual applications ready for you to review.` : '')
    );
  }
});

// Remove from queue
window.removeFromQueue = function(idx) {
  appQueue.splice(idx, 1);
  saveUserData('bj_app_queue', JSON.stringify(appQueue));
  renderAppQueue();
};

// Select all checkbox
$('#a-select-all')?.addEventListener('change', e => {
  $$('.a-row-check').forEach(cb => cb.checked = e.target.checked);
});

// Set notification email from user
if (currentUser?.email) {
  const emailInput = $('#notify-email-addr');
  if (emailInput && !emailInput.value) emailInput.value = currentUser.email;
}

renderAppQueue();
renderAppHistory();
loadPipelineIntelligenceSettings();

// Gmail
// APR-001/FB-GHOST-BADGE-001: gmail-connect-btn was on Ghost Monitor page (removed)
const _gcBtn = $('#gmail-connect-btn');
if (_gcBtn) _gcBtn.addEventListener('click', () => {
  alert('Gmail integration coming soon.\n\nThis will use Gmail OAuth to auto-detect responses from companies you\'ve applied to.');
});

// ============================================================
// NOTIFICATION SYSTEM — Preferences, Phone, Escalation, Overrides, Log
// ============================================================

// ---- Notification type catalog (matches NOTIFICATION_SPEC.md) ----
const NOTIF_TYPES = [
  { id: 'auto_apply_confirm', label: 'Auto-apply confirmations', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'apply_alert', label: 'Apply-on-notification alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'pipeline_response', label: 'Pipeline changes', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_interview', label: 'Interview / Offer alerts', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'listing_closed', label: 'Listing closed', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_stale', label: 'Stale application reminders', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'new_jobs_daily', label: 'New job matches', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'company_hiring_surge', label: 'Company hiring surge', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'ghost_alert', label: 'Ghost alerts', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'salary_change', label: 'Salary range changes', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
  { id: 'connections_at_company', label: 'Network match alerts', tier: 'network', defaultFreq: 'realtime', smsDefault: true },
  { id: 'weekly_summary', label: 'Weekly summary', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'market_stats', label: 'Market stats digest', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  { id: 'ghost_report', label: 'Ghost report', tier: 'weekly', defaultFreq: 'weekly', smsDefault: false },
  // v2: Job intelligence
  { id: 'company_new_roles', label: 'Company posted more roles', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'resume_decay', label: 'Resume readiness drop', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'resume_improve', label: 'Resume readiness improved', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  { id: 'exclusion_override', label: 'Excluded company match', tier: 'event', defaultFreq: 'daily', smsDefault: false },
  // v2: Credit / Billing
  { id: 'credit_low', label: 'Credit balance low', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'autorefill_success', label: 'Auto-refill confirmations', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'autorefill_failed', label: 'Auto-refill failed', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  { id: 'credit_exhausted', label: 'Credits exhausted mid-month', tier: 'credit', defaultFreq: 'realtime', smsDefault: false },
  // v2: Pipeline signals
  { id: 'signal_calendar', label: 'Calendar interview detected', tier: 'realtime', defaultFreq: 'realtime', smsDefault: true },
  { id: 'signal_email', label: 'Email signal detected', tier: 'realtime', defaultFreq: 'realtime', smsDefault: false },
  { id: 'pipeline_prompt', label: 'Pipeline check-in prompts', tier: 'daily', defaultFreq: 'daily', smsDefault: false },
];

let notifPrefs = null;   // notification_preferences row
let notifChannels = {};  // notification_channels keyed by notification_type
let phoneVerified = false;

// ---- Load notification preferences from Supabase ----
async function loadNotifPrefs() {
  if (!currentUser) return;
  try {
    // Global prefs — upsert defaults if row doesn't exist yet
    var { error: upsErr } = await sb.from('notification_preferences').upsert({
      user_id: currentUser.id
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (upsErr) reportError('applications:notif-pref-upsert', upsErr);
    const { data: prefs, error: prefErr } = await sb.from('notification_preferences')
      .select('*').eq('user_id', currentUser.id).single();
    if (prefErr && prefErr.code !== 'PGRST116') reportError('applications:notif-pref-load', prefErr);
    notifPrefs = prefs;

    // Per-type channels
    const { data: channels, error: chanErr } = await sb.from('notification_channels')
      .select('*').eq('user_id', currentUser.id);
    if (chanErr) reportError('applications:notif-channels', chanErr);
    notifChannels = {};
    (channels || []).forEach(c => { notifChannels[c.notification_type] = c; });

    // Apply to UI
    phoneVerified = prefs?.phone_verified || false;
    applyPrefsToUI();
    applyPhoneUI();
    applyEscalationUI();
  } catch(e) { reportError('applications', e); console.warn('[Notif] Failed to load preferences:', e);
  }
}

function applyPrefsToUI() {
  // Update matrix toggles from loaded channel data
  $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
    const type = row.dataset.notif;
    const ch = notifChannels[type];
    const emailToggle = row.querySelector('.nch-email');
    const smsToggle = row.querySelector('.nch-sms');
    const freqSelect = row.querySelector('.nch-freq');

    if (emailToggle && ch) emailToggle.checked = ch.email !== false;
    if (smsToggle) {
      const smsSwitch = smsToggle.closest('.toggle-switch');
      if (phoneVerified) {
        smsSwitch.classList.remove('disabled');
        smsSwitch.title = '';
        smsToggle.disabled = false;
        if (ch) smsToggle.checked = ch.sms === true;
      } else {
        smsSwitch.classList.add('disabled');
        smsSwitch.title = 'Verify phone to enable SMS';
        smsToggle.disabled = true;
        smsToggle.checked = false;
      }
    }
    if (freqSelect && ch?.frequency) freqSelect.value = ch.frequency;
  });
}

function applyPhoneUI() {
  if (phoneVerified && notifPrefs?.phone_number) {
    $('#phone-setup-unverified').style.display = 'none';
    $('#phone-setup-verified').style.display = '';
    $('#verified-phone-display').textContent = notifPrefs.phone_number;
  } else {
    $('#phone-setup-unverified').style.display = '';
    $('#phone-setup-verified').style.display = 'none';
  }
}

function applyEscalationUI() {
  if (!notifPrefs) return;
  const slider = $('#esc-timeout-slider');
  if (slider && notifPrefs.escalation_timeout_hours) {
    slider.value = notifPrefs.escalation_timeout_hours;
    $('#esc-timeout-val').textContent = notifPrefs.escalation_timeout_hours + ' hours';
    $('#esc-hours-label').textContent = notifPrefs.escalation_timeout_hours;
  }
  if (notifPrefs.quiet_start) $('#quiet-start').value = notifPrefs.quiet_start.slice(0, 5);
  if (notifPrefs.quiet_end) $('#quiet-end').value = notifPrefs.quiet_end.slice(0, 5);
  if (notifPrefs.timezone) $('#notif-timezone').value = notifPrefs.timezone;
}

// ---- Save notification preferences ----
$('#notif-save-prefs')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-prefs');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Upsert global prefs
    var { error: gpErr } = await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      email_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (gpErr) { reportError('applications:save-global-prefs', gpErr); throw gpErr; }

    // Upsert per-type channels
    const rows = [];
    $$('#notif-pref-matrix tr[data-notif]').forEach(row => {
      const type = row.dataset.notif;
      const emailOn = row.querySelector('.nch-email')?.checked ?? true;
      const smsOn = row.querySelector('.nch-sms')?.checked ?? false;
      const freqEl = row.querySelector('.nch-freq');
      const freq = freqEl ? freqEl.value : NOTIF_TYPES.find(n => n.id === type)?.defaultFreq || 'realtime';
      rows.push({
        user_id: currentUser.id,
        notification_type: type,
        email: emailOn,
        sms: smsOn,
        frequency: freq
      });
    });
    if (rows.length > 0) {
      var { error: chErr } = await sb.from('notification_channels').upsert(rows, { onConflict: 'user_id,notification_type' });
      if (chErr) { reportError('applications:save-channels', chErr); throw chErr; }
    }

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Preferences'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications:save-prefs', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// ---- Phone Verification ----
let pendingPhone = '';

$('#phone-send-otp')?.addEventListener('click', async () => {
  const country = $('#phone-country').value;
  const number = $('#phone-number').value.replace(/\D/g, '');
  if (!number || number.length < 7) {
    alert('Please enter a valid phone number.');
    return;
  }
  pendingPhone = country + number;
  const btn = $('#phone-send-otp');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const { error } = await sb.auth.signInWithOtp({ phone: pendingPhone });
    if (error) throw error;
    $('#otp-row').style.display = '';
    $('#otp-status').textContent = 'Code sent. Check your phone.';
    $('#otp-status').style.color = 'var(--green)';
    btn.textContent = 'Resend Code';
    btn.disabled = false;
  } catch (e) {
    reportError('applications', e);
    console.error('[Phone] OTP send failed:', e);
    $('#otp-status').textContent = 'Failed to send code: ' + (e.message || e);
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Send Verification Code';
    btn.disabled = false;
  }
});

$('#phone-verify-otp')?.addEventListener('click', async () => {
  const code = $('#otp-code').value.trim();
  if (!code || code.length !== 6) {
    $('#otp-status').textContent = 'Enter the 6-digit code.';
    $('#otp-status').style.color = 'var(--warm)';
    return;
  }
  const btn = $('#phone-verify-otp');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const { data, error } = await sb.auth.verifyOtp({
      phone: pendingPhone,
      token: code,
      type: 'sms'
    });
    if (error) throw error;

    // Update notification_preferences with verified phone
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      phone_number: pendingPhone,
      phone_verified: true,
      sms_enabled: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    phoneVerified = true;
    if (notifPrefs) {
      notifPrefs.phone_number = pendingPhone;
      notifPrefs.phone_verified = true;
    }
    applyPhoneUI();
    applyPrefsToUI(); // unlock SMS toggles

    btn.textContent = 'Verify';
    btn.disabled = false;
  } catch (e) {
    reportError('applications', e);
    console.error('[Phone] Verify failed:', e);
    $('#otp-status').textContent = 'Invalid code. Try again.';
    $('#otp-status').style.color = 'var(--red)';
    btn.textContent = 'Verify';
    btn.disabled = false;
  }
});

$('#phone-change')?.addEventListener('click', () => {
  phoneVerified = false;
  applyPhoneUI();
  $('#phone-number').value = '';
  $('#otp-row').style.display = 'none';
  $('#otp-code').value = '';
  $('#otp-status').textContent = '';
});

// ---- Escalation Rules ----
$('#esc-timeout-slider')?.addEventListener('input', e => {
  const val = e.target.value;
  $('#esc-timeout-val').textContent = val + ' hour' + (val === '1' ? '' : 's');
  $('#esc-hours-label').textContent = val;
});

$('#notif-save-escalation')?.addEventListener('click', async () => {
  if (!currentUser) return;
  const btn = $('#notif-save-escalation');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await sb.from('notification_preferences').upsert({
      user_id: currentUser.id,
      escalation_timeout_hours: parseInt($('#esc-timeout-slider').value),
      quiet_start: $('#quiet-start').value + ':00',
      quiet_end: $('#quiet-end').value + ':00',
      timezone: $('#notif-timezone').value,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Escalation Rules'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications', e);
    console.error('[Notif] Escalation save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

// Populate timezone dropdown
(function populateTimezones() {
  const sel = $('#notif-timezone');
  if (!sel) return;
  const zones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
    'America/Toronto', 'America/Vancouver',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Melbourne',
    'Pacific/Auckland'
  ];
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected && !zones.includes(detected)) zones.unshift(detected);

  sel.innerHTML = zones.map(tz =>
    `<option value="${tz}" ${tz === detected ? 'selected' : ''}>${tz.replace(/_/g, ' ')}</option>`
  ).join('');
})();

// ---- Filter-Specific Overrides ----
function populateOverrideFilterSelect() {
  const sel = $('#override-filter-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select a saved filter or prompt...</option>';
  // Saved filters
  savedFilters.forEach(f => {
    sel.innerHTML += `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}</option>`;
  });
  // Session 5: Saved prompts with derived_filters
  if (typeof _savedPrompts !== 'undefined' && _savedPrompts && _savedPrompts.length > 0) {
    var hasPrompts = _savedPrompts.some(p => p.derived_filters && Object.keys(p.derived_filters).length > 0);
    if (hasPrompts) {
      sel.innerHTML += '<option disabled>── Chat Prompts ──</option>';
      _savedPrompts.forEach(p => {
        if (p.derived_filters && Object.keys(p.derived_filters).length > 0) {
          sel.innerHTML += `<option value="prompt:${escapeHtml(p.id)}" data-prompt-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`;
        }
      });
    }
  }
}
populateOverrideFilterSelect();


// Session 5: Refresh override dropdown when saved prompts update
function refreshOverrideFilterSelectWithPrompts() {
  populateOverrideFilterSelect();
}
$('#override-filter-select')?.addEventListener('change', async (e) => {
  const filterName = e.target.value;
  if (!filterName) {
    $('#override-matrix-wrap').style.display = 'none';
    $('#override-empty').style.display = '';
    return;
  }
  $('#override-empty').style.display = 'none';
  $('#override-matrix-wrap').style.display = '';
  $('#override-filter-name').textContent = filterName;

  // Load existing overrides for this filter
  let overrides = {};
  if (currentUser) {
    try {
      const { data, error } = await sb.from('notification_filter_overrides')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('filter_name', filterName);
      if (error) { reportError('applications:overrides', error); }
      (data || []).forEach(o => { overrides[o.notification_type] = o; });
    } catch(e) { reportError('applications:ignore', e); }
  }

  // Build override matrix rows
  const tbody = $('#override-matrix-body');
  tbody.innerHTML = NOTIF_TYPES.map(nt => {
    const ov = overrides[nt.id];
    const emailChecked = ov ? ov.email : true;
    const smsChecked = ov ? ov.sms : nt.smsDefault;
    const freq = ov?.frequency || nt.defaultFreq;
    const smsDisabled = !phoneVerified ? 'disabled' : '';
    const smsClass = !phoneVerified ? 'disabled' : '';
    const freqHtml = nt.tier === 'realtime' || nt.tier === 'weekly'
      ? `<span style="font-size:12px;color:var(--text-faint);">${nt.tier === 'realtime' ? 'Real-time' : 'Weekly'}</span>`
      : `<select class="freq-select ov-freq" data-type="${nt.id}">
          <option value="realtime" ${freq==='realtime'?'selected':''}>Real-time</option>
          <option value="daily" ${freq==='daily'?'selected':''}>Daily</option>
          <option value="weekly" ${freq==='weekly'?'selected':''}>Weekly</option>
        </select>`;

    return `<tr data-ov-type="${nt.id}">
      <td>${nt.label}</td>
      <td><label class="toggle-switch"><input type="checkbox" class="ov-email" ${emailChecked?'checked':''}><span class="toggle-slider"></span></label></td>
      <td><label class="toggle-switch ${smsClass}"><input type="checkbox" class="ov-sms" ${smsChecked?'checked':''} ${smsDisabled}><span class="toggle-slider"></span></label></td>
      <td>${freqHtml}</td>
    </tr>`;
  }).join('');
});

$('#override-save')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  const btn = $('#override-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const rows = [];
    $$('#override-matrix-body tr[data-ov-type]').forEach(row => {
      const type = row.dataset.ovType;
      rows.push({
        user_id: currentUser.id,
        filter_name: filterName,
        notification_type: type,
        email: row.querySelector('.ov-email')?.checked ?? true,
        sms: row.querySelector('.ov-sms')?.checked ?? false,
        frequency: row.querySelector('.ov-freq')?.value || null
      });
    });
    await sb.from('notification_filter_overrides').upsert(rows, {
      onConflict: 'user_id,filter_name,notification_type'
    });
    btn.textContent = 'Saved';
    setTimeout(() => { btn.textContent = 'Save Overrides'; btn.disabled = false; }, 1500);
  } catch (e) {
    reportError('applications', e);
    console.error('[Notif] Override save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
});

$('#override-clear')?.addEventListener('click', async () => {
  const filterName = $('#override-filter-select').value;
  if (!filterName || !currentUser) return;
  if (!confirm(`Clear all notification overrides for "${filterName}"?`)) return;

  try {
    await sb.from('notification_filter_overrides')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('filter_name', filterName);
    // Re-trigger the dropdown to reload fresh
    $('#override-filter-select').dispatchEvent(new Event('change'));
  } catch(e) { reportError('applications', e); console.error('[Notif] Override clear failed:', e); }
});

// APR-001: Notification Log removed — lives exclusively on Notification Center page
// (rendered by notification-center.js with nc- prefixed IDs)

// ---- Pulsing Nav Dots ----
async function checkNavPulses() {
  if (!currentUser) return;
  try {
    // Get last_seen_at
    const { data: profile, error: profErr } = await sb.from('profiles')
      .select('last_seen_at')
      .eq('id', currentUser.id).single();
    if (profErr && profErr.code !== 'PGRST116') reportError('applications:nav-pulse', profErr);
    const lastSeen = profile?.last_seen_at || new Date(0).toISOString();

    // Applications: pending notification actions
    const { count: pendingActions } = await sb
      .from('notification_actions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .eq('status', 'pending');

    const appDot = document.querySelector('[data-page="applications"] .ext-status-dot');
    if (pendingActions > 0 && appDot) {
      appDot.classList.add('pulse');
    }

    // Jobs: new since last feed view (not last page load — cron adds jobs constantly)
    const lastFeedView = localStorage.getItem('bj_last_feed_view') || new Date(0).toISOString();
    const { count: newJobs } = await sb
      .from('ats_jobs')
      .select('*', { count: 'exact', head: true })
      .gt('first_seen_at', lastFeedView)
      .eq('status', 'open');

    if (newJobs > 25) {
      const jobsDot = document.querySelector('[data-page="jobs"] .ext-status-dot');
      if (jobsDot) jobsDot.classList.add('pulse');
    }

    // Update last_seen_at
    await sb.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', currentUser.id);
  } catch(e) { reportError('applications', e); console.warn('[Pulse] Check failed:', e);
  }
}

// Clear pulse when navigating to a page
const _origNavClick = true;
$$('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const dot = item.querySelector('.ext-status-dot');
    if (dot) dot.classList.remove('pulse');
  });
});

// ---- Init notification system ----
async function initNotifications() {
  await loadNotifPrefs();
  await loadNotifLog();
  await checkNavPulses();
}
if (currentUser) {
  initNotifications();
} else {
  // Retry once auth completes (app.js init is async)
  const _waitAuth = setInterval(() => {
    if (currentUser) {
      clearInterval(_waitAuth);
      initNotifications();
    }
  }, 500);
  setTimeout(() => clearInterval(_waitAuth), 10000); // give up after 10s
}


// ── Pipeline Intelligence Settings (Phase D) ─────────────────
async function loadPipelineIntelligenceSettings() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('pipeline_tracking_settings')
      .select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error) { /* silent — table may not exist or user has no row yet */ return; }
    if (!data) return;
    const el = (id) => document.getElementById(id);
    if (el('pi-smart-prompts')) el('pi-smart-prompts').checked = data.smart_prompts_enabled !== false;
    if (el('pi-signal-detection')) el('pi-signal-detection').checked = data.signal_detection_enabled === true;
    if (el('pi-cadence-saved')) el('pi-cadence-saved').value = data.cadence_saved_days || 3;
    if (el('pi-cadence-applied')) el('pi-cadence-applied').value = data.cadence_applied_days || 7;
    if (el('pi-cadence-responded')) el('pi-cadence-responded').value = data.cadence_responded_days || 5;
    if (el('pi-cadence-interview')) el('pi-cadence-interview').value = data.cadence_interview_days || 3;
    if (el('pi-scan-freq')) el('pi-scan-freq').value = String(data.scan_frequency_minutes || 15);
    if (el('pi-thread-depth')) el('pi-thread-depth').value = data.email_thread_depth || 50;
    if (el('pi-cal-lookahead')) el('pi-cal-lookahead').value = data.calendar_lookahead_days || 14;
    const channels = data.prompt_channels || ['email', 'in_app'];
    if (el('pi-ch-email')) el('pi-ch-email').checked = channels.includes('email');
    if (el('pi-ch-inapp')) el('pi-ch-inapp').checked = channels.includes('in_app');
    if (el('pi-ch-sms')) el('pi-ch-sms').checked = channels.includes('sms');
    const confRadios = document.querySelectorAll('input[name="pi-confidence"]');
    confRadios.forEach(r => { r.checked = parseFloat(r.value) === (data.confidence_threshold || 0.6); });
  } catch(e) { reportError('applications', e); console.log('[BJ] No pipeline intelligence settings yet');
  }
  // Show Gmail status
  try {
    const { data: conn, error: connErr } = await sb.from('gmail_connections')
      .select('sync_status').eq('user_id', currentUser.id).single();
    if (connErr && connErr.code !== 'PGRST116') reportError('applications:gmail-status', connErr);
    const statusEl = document.getElementById('pi-gmail-status');
    if (statusEl) statusEl.style.display = '';
    if (conn?.sync_status === 'active') {
      const connEl = document.getElementById('pi-gmail-connected');
      const btnEl = document.getElementById('pi-gmail-connect');
      if (connEl) connEl.style.display = '';
      if (btnEl) btnEl.style.display = 'none';
      // v6.04: Mark integration connected for adoption suppression
      if (typeof markIntegrationConnected === 'function') markIntegrationConnected('gmail');
    }
  } catch(e) { reportError('applications:no connection', e); }
}

async function savePipelineIntelligenceSettings() {
  if (!currentUser?.id) return;
  const el = (id) => document.getElementById(id);
  const confRadio = document.querySelector('input[name="pi-confidence"]:checked');
  const settings = {
    user_id: currentUser.id,
    smart_prompts_enabled: el('pi-smart-prompts')?.checked ?? true,
    signal_detection_enabled: el('pi-signal-detection')?.checked ?? false,
    cadence_saved_days: parseInt(el('pi-cadence-saved')?.value) || 3,
    cadence_applied_days: parseInt(el('pi-cadence-applied')?.value) || 7,
    cadence_responded_days: parseInt(el('pi-cadence-responded')?.value) || 5,
    cadence_interview_days: parseInt(el('pi-cadence-interview')?.value) || 3,
    scan_frequency_minutes: parseInt(el('pi-scan-freq')?.value) || 15,
    confidence_threshold: confRadio ? parseFloat(confRadio.value) : 0.6,
    email_thread_depth: parseInt(el('pi-thread-depth')?.value) || 50,
    calendar_lookahead_days: parseInt(el('pi-cal-lookahead')?.value) || 14,
    prompt_channels: [
      ...(el('pi-ch-email')?.checked ? ['email'] : []),
      ...(el('pi-ch-inapp')?.checked ? ['in_app'] : []),
      ...(el('pi-ch-sms')?.checked ? ['sms'] : []),
    ],
    updated_at: new Date().toISOString(),
  };
  try {
    await sb.from('pipeline_tracking_settings').upsert(settings, { onConflict: 'user_id' });
    const btn = el('pi-save-btn');
    if (btn) { btn.textContent = 'Saved!'; setTimeout(() => btn.textContent = 'Save Pipeline Settings', 1500); }
  } catch(e) { reportError('applications', e); console.error('[BJ] Pipeline settings save error:', e);
  }
}

// Load settings when applications page is shown
if (typeof _origInitApplications === 'undefined') {
  var _origInitApplications = typeof initApplications === 'function' ? initApplications : null;
}

// CS-P1-004 FE-005: Register applications exports with BJ namespace
(function() {
  ['removeFromQueue','switchSettingsTab','toggleAppSettings'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'applications', registered: Date.now() };
    }
  });
})();


// === js/settings.js ===
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
    const data = await safeQuery(() => sb.from('connections').select('*').limit(5000), { label: 'settings:connections', fallback: [] });
    if (!data?.length) { showToast('Nothing to export yet — start tracking applications first.', { type: 'info' }); return; }
    const csv = [Object.keys(data[0]).join(','), ...data.map(r => Object.values(r).map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `brilliant-jobs-export-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  } catch (e) { showToast('Export failed: ' + e.message, { type: 'error' }); }
});

// Logout handler moved to dashboard-inline.js (loads with shell, not deferred chunk)

// ---- CS-P1-014: Privacy & Data Rights ----

// Full GDPR data export (JSON via Edge Function)
$('#st-full-export')?.addEventListener('click', async () => {
  try {
    var btn = $('#st-full-export');
    btn.disabled = true;
    btn.textContent = 'Preparing export…';
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please log in to export data.', { type: 'error' }); return; }
    var resp = await fetch(BJ_SUPABASE_URL + '/functions/v1/data-export', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!resp.ok) { var err = await resp.json().catch(function() { return {}; }); throw new Error(err.error || 'Export failed'); }
    var blob = await resp.blob();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brilliant-jobs-full-export-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Data export downloaded successfully.', { type: 'success' });
  } catch (e) {
    showToast('Export failed: ' + e.message, { type: 'error' });
  } finally {
    var btn2 = $('#st-full-export');
    if (btn2) { btn2.disabled = false; btn2.innerHTML = '<i data-lucide="download" class="icon-sm icon-stroke" style="margin-right:6px;vertical-align:-2px;"></i>Download All My Data (JSON)'; }
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }
});

// Account deletion — initiate
$('#st-delete-account')?.addEventListener('click', async () => {
  var confirmed = confirm(
    'Are you sure you want to delete your account?\n\n' +
    'This will schedule your account for permanent deletion after a 30-day grace period.\n' +
    'During the grace period, you can log in and cancel the deletion.\n\n' +
    'After the grace period, ALL your data will be permanently removed.'
  );
  if (!confirmed) return;
  var doubleConfirm = prompt('Type DELETE to confirm account deletion:');
  if (doubleConfirm !== 'DELETE') { showToast('Account deletion cancelled.', { type: 'info' }); return; }
  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please log in.', { type: 'error' }); return; }
    var resp = await fetch(BJ_SUPABASE_URL + '/functions/v1/account-delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    var result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Deletion request failed');
    showToast('Account deletion scheduled. You have 30 days to cancel.', { type: 'success' });
    _showDangerZonePending(result.grace_expires_at);
  } catch (e) { showToast('Failed: ' + e.message, { type: 'error' }); }
});

// Account deletion — cancel
$('#st-cancel-delete')?.addEventListener('click', async () => {
  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) { showToast('Please log in.', { type: 'error' }); return; }
    var resp = await fetch(BJ_SUPABASE_URL + '/functions/v1/account-delete', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel: true })
    });
    var result = await resp.json();
    if (!resp.ok) throw new Error(result.error || 'Cancellation failed');
    showToast('Account deletion cancelled. Your account is fully restored.', { type: 'success' });
    _showDangerZoneNormal();
  } catch (e) { showToast('Failed: ' + e.message, { type: 'error' }); }
});

function _showDangerZonePending(graceExpiresAt) {
  var normalEl = $('#danger-zone-normal');
  var pendingEl = $('#danger-zone-pending');
  var dateEl = $('#dz-delete-date');
  if (normalEl) normalEl.style.display = 'none';
  if (pendingEl) pendingEl.style.display = 'block';
  if (dateEl && graceExpiresAt) dateEl.textContent = new Date(graceExpiresAt).toLocaleDateString();
}

function _showDangerZoneNormal() {
  var normalEl = $('#danger-zone-normal');
  var pendingEl = $('#danger-zone-pending');
  if (normalEl) normalEl.style.display = 'block';
  if (pendingEl) pendingEl.style.display = 'none';
}

// Check deletion status on load
async function _checkDeletionStatus() {
  try {
    if (!currentUser) return;
    var { data } = await safeQuery(function() {
      return sb.from('profiles').select('deleted_at').eq('id', currentUser.id).single();
    }, { label: 'settings:deletion-check', fallback: null });
    if (data && data.deleted_at) {
      var graceExpires = new Date(new Date(data.deleted_at).getTime() + 30 * 86400000).toISOString();
      _showDangerZonePending(graceExpires);
    }
  } catch (_) { /* non-critical */ }
}

// Initialize on settings page load
if (typeof window._bjSettingsInitQueue === 'undefined') window._bjSettingsInitQueue = [];
window._bjSettingsInitQueue.push(_checkDeletionStatus);


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
  } catch(e) { reportError('settings', e); console.warn('[BJ] AI prefs load exception:', e);
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
    reportError('settings', e);
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
    } catch (e) { reportError('settings', e); console.warn('[BJ] File upload failed:', e); toastError('File upload failed'); }
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
    reportError('settings', e);
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
  } catch(e) { reportError('settings', e); console.warn('[BJ] Passive mode load exception:', e); }
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
    reportError('settings', e);
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
    var { error: chanErr } = await sb.from('notification_channels')
      .upsert({ user_id: currentUser.id, notification_type: 'new_jobs_daily', frequency: freq }, { onConflict: 'user_id,notification_type' });
    if (chanErr) reportError('settings:passive-channel', chanErr);
  } catch(e) { reportError('settings', e); console.warn('[BJ] Passive notification channel sync error:', e); }
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
  } catch(e) { reportError('settings', e); console.warn('[BJ] bootstrapFiltersFromResume exception:', e);
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
  } catch(e) { reportError('settings', e); console.warn('[BJ] autoHirePause exception:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// EXT-AS-1: APPLICANT PROFILE + APPLY SETTINGS SYNC
// ═══════════════════════════════════════════════════════════

var _applicantProfile = null;

async function loadApplicantProfile() {
  if (!currentUser) return;
  try {
    var res = await safeQuery(function() {
      return sb.from('profiles').select('user_data').eq('id', currentUser.id).maybeSingle();
    }, { label: 'settings:load-profile', fallback: null });
    var ud = (res && res.user_data) || {};
    _applicantProfile = ud.applicant_profile || {};
    // AF-002: Cache profile in localStorage for isSetupComplete()
    try { localStorage.setItem('bj_applicant_profile', JSON.stringify(_applicantProfile)); } catch (e) { /* ignore */ }
    _populateApplicantProfileForm(_applicantProfile);
    // Also load apply_settings from Supabase into local
    if (ud.apply_settings) {
      Object.assign(userApplySettings, ud.apply_settings);
      // AF-002: Cache apply_settings for isSetupComplete()
      try { localStorage.setItem('bj_apply_settings', JSON.stringify(ud.apply_settings)); } catch (e) { /* ignore */ }
      saveApplySettings(); // sync to localStorage
    }
    _updateApplySettingsDisplay();
  } catch (e) { reportError('settings:load-applicant-profile', e); }
}

function _populateApplicantProfileForm(p) {
  var fn = p.name || '';
  var parts = fn.split(' ');
  var el;
  el = document.getElementById('ap-first-name');
  if (el) el.value = parts[0] || '';
  el = document.getElementById('ap-last-name');
  if (el) el.value = parts.slice(1).join(' ') || '';
  el = document.getElementById('ap-email');
  if (el) el.value = p.email || (currentUser ? currentUser.email : '') || '';
  el = document.getElementById('ap-phone');
  if (el) el.value = p.phone || '';
  el = document.getElementById('ap-linkedin');
  if (el) el.value = p.linkedin || '';
  el = document.getElementById('ap-location');
  if (el) el.value = p.location || '';
  el = document.getElementById('ap-work-auth');
  if (el) el.checked = p.work_authorization !== false;
  el = document.getElementById('ap-sponsorship');
  if (el) el.checked = p.needs_sponsorship === true;
  // AF-001: EEOC/OFCCP voluntary self-identification
  var eeo = p.eeo_preferences || {};
  el = document.getElementById('ap-eeo-gender');
  if (el) el.value = eeo.gender || '';
  el = document.getElementById('ap-eeo-ethnicity');
  if (el) el.value = eeo.ethnicity || '';
  el = document.getElementById('ap-eeo-veteran');
  if (el) el.value = eeo.veteranStatus || '';
  el = document.getElementById('ap-eeo-disability');
  if (el) el.value = eeo.disabilityStatus || '';

  // EXT-AS-9: Show persistent saved indicator when profile has name + email
  var status = document.getElementById('ap-save-status');
  if (status && p.name && p.name.trim().length > 0 && p.email && p.email.trim().length > 0) {
    status.style.display = 'inline';
    status.textContent = 'Profile stored';
    status.style.color = 'var(--green)';
  }
}

function _readApplicantProfileForm() {
  var firstName = (document.getElementById('ap-first-name')?.value || '').trim();
  var lastName = (document.getElementById('ap-last-name')?.value || '').trim();
  return {
    name: (firstName + ' ' + lastName).trim(),
    email: (document.getElementById('ap-email')?.value || '').trim(),
    phone: (document.getElementById('ap-phone')?.value || '').trim(),
    linkedin: (document.getElementById('ap-linkedin')?.value || '').trim(),
    location: (document.getElementById('ap-location')?.value || '').trim(),
    work_authorization: document.getElementById('ap-work-auth')?.checked !== false,
    needs_sponsorship: document.getElementById('ap-sponsorship')?.checked === true,
    // AF-001: EEOC/OFCCP voluntary self-identification
    eeo_preferences: {
      gender: (document.getElementById('ap-eeo-gender')?.value || '').trim() || null,
      ethnicity: (document.getElementById('ap-eeo-ethnicity')?.value || '').trim() || null,
      veteranStatus: (document.getElementById('ap-eeo-veteran')?.value || '').trim() || null,
      disabilityStatus: (document.getElementById('ap-eeo-disability')?.value || '').trim() || null
    }
  };
}

async function saveApplicantProfile() {
  if (!currentUser) { showToast('Sign in to save your profile.', { type: 'warning' }); return; }
  var profile = _readApplicantProfileForm();
  if (!profile.name) { showToast('First name is required.', { type: 'warning' }); return; }
  if (!profile.email) { showToast('Email is required.', { type: 'warning' }); return; }
  var btn = document.getElementById('ap-save-btn');
  var status = document.getElementById('ap-save-status');
  if (btn) btn.disabled = true;
  try {
    // Read existing user_data, merge applicant_profile
    var res = await safeQuery(function() {
      return sb.from('profiles').select('user_data').eq('id', currentUser.id).maybeSingle();
    }, { label: 'settings:read-profile', fallback: null });
    var ud = (res && res.user_data) || {};
    ud.applicant_profile = profile;
    await sb.from('profiles').update({ user_data: ud }).eq('id', currentUser.id);
    _applicantProfile = profile;
    // AF-002: Cache profile in localStorage for isSetupComplete() checks
    try { localStorage.setItem('bj_applicant_profile', JSON.stringify(profile)); } catch (e) { /* ignore */ }
    if (status) { status.style.display = 'inline'; status.textContent = 'Profile stored'; status.style.color = 'var(--green)'; }
    showToast('Applicant profile saved.', { type: 'success' });
    if (typeof posthog !== 'undefined') posthog.capture('applicant_profile_saved', { has_phone: !!profile.phone, has_linkedin: !!profile.linkedin, has_location: !!profile.location, has_eeo: !!(profile.eeo_preferences && (profile.eeo_preferences.gender || profile.eeo_preferences.ethnicity || profile.eeo_preferences.veteranStatus || profile.eeo_preferences.disabilityStatus)) });
    // AF-002: Check if setup is now complete after profile save
    if (typeof checkAndSetSetupComplete === 'function') checkAndSetSetupComplete();
  } catch (e) {
    reportError('settings:save-applicant-profile', e);
    showToast('Failed to save profile: ' + (e.message || e), { type: 'error' });
    if (status) { status.style.display = 'inline'; status.textContent = 'Error'; status.style.color = 'var(--red)'; }
  } finally { if (btn) btn.disabled = false; }
}

async function syncApplySettingsToSupabase() {
  if (!currentUser) return;
  var btn = document.getElementById('aps-sync-btn');
  var status = document.getElementById('aps-sync-status');
  if (btn) btn.disabled = true;
  if (status) { status.style.display = 'inline'; status.textContent = 'Syncing...'; status.style.color = 'var(--text-dim)'; }
  try {
    var res = await safeQuery(function() {
      return sb.from('profiles').select('user_data').eq('id', currentUser.id).maybeSingle();
    }, { label: 'settings:read-apply-settings', fallback: null });
    var ud = (res && res.user_data) || {};
    ud.apply_settings = {
      default_apply_mode: userApplySettings.default_apply_mode || 'manual',
      default_score_threshold: userApplySettings.default_score_threshold || 70,
      active_resume_id: window._activeResumeId || null,
      daily_apply_limit: userApplySettings.daily_apply_limit || 25,
      default_notification_channels: userApplySettings.default_notification_channels || ['in_app', 'email'],
      auto_expire_hours: userApplySettings.auto_expire_hours || 48
    };
    await sb.from('profiles').update({ user_data: ud }).eq('id', currentUser.id);
    // AF-002: Cache apply_settings in localStorage for isSetupComplete()
    try { localStorage.setItem('bj_apply_settings', JSON.stringify(ud.apply_settings)); } catch (e) { /* ignore */ }
    if (status) { status.textContent = 'Synced'; status.style.color = 'var(--green)'; }
    setTimeout(function() { if (status) status.style.display = 'none'; }, 3000);
    if (typeof posthog !== 'undefined') posthog.capture('apply_settings_synced', { mode: ud.apply_settings.default_apply_mode });
    // AF-002: Check if setup is now complete after settings sync
    if (typeof checkAndSetSetupComplete === 'function') checkAndSetSetupComplete();
  } catch (e) {
    reportError('settings:sync-apply-settings', e);
    if (status) { status.textContent = 'Error'; status.style.color = 'var(--red)'; }
  } finally { if (btn) btn.disabled = false; }
}

function _updateApplySettingsDisplay() {
  var modeEl = document.getElementById('aps-mode-display');
  var threshEl = document.getElementById('aps-threshold-display');
  var limitEl = document.getElementById('aps-limit-display');
  if (modeEl) modeEl.textContent = (userApplySettings.default_apply_mode || 'manual').replace(/_/g, ' ');
  if (threshEl) threshEl.textContent = (userApplySettings.default_score_threshold || 70) + '%';
  if (limitEl) limitEl.textContent = (userApplySettings.daily_apply_limit || 25) + '/day';
}

// Wire up save + sync buttons
document.getElementById('ap-save-btn')?.addEventListener('click', saveApplicantProfile);
document.getElementById('aps-sync-btn')?.addEventListener('click', syncApplySettingsToSupabase);

// Auto-load profile data on init (deferred chunk load)
if (typeof currentUser !== 'undefined' && currentUser) {
  loadApplicantProfile();
} else {
  // Retry after auth resolves
  setTimeout(function() { if (typeof currentUser !== 'undefined' && currentUser) loadApplicantProfile(); }, 2000);
}

// Export for SPA bridge + extension
window.saveApplicantProfile = saveApplicantProfile;
window.loadApplicantProfile = loadApplicantProfile;
window.syncApplySettingsToSupabase = syncApplySettingsToSupabase;
window._applicantProfile = _applicantProfile;

// CS-P1-004 FE-005: Register settings exports with BJ namespace
(function() {
  ['_conditionalWakeHooked'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'settings', registered: Date.now() };
    }
  });
})();


// === js/stats.js ===
// === js/stats.js ===
// Stats page — filter-scoped analytics with ECharts
// Redesigned per stats-page-redesign-brief.md (Pod 1, 2026-02-19)
// Dependencies: sb, savedFilters, filterColors, levelHierarchy, getJobLevel, buildFilterQuery, getLocationMatchIds

// ─── State ───
var statsInitialized = false;
var statsCharts = {};
var statsCache = {};
var STATS_CACHE_TTL = 10 * 60 * 1000;
var STATS_ROW_CAP = 5000;
var STATS_DEDUP_CAP = 10000;
var statsSelectedFilters = safeReadLS('bj_stats_filters', ["__all__"]);
var _statsDebounce = null;
var statsCompareMode = false;

// Light-theme ECharts (dark tooltips float over light cards)
// Color tokens — single source of truth, no hardcoded hsl() in chart functions
var _T = {
  border: 'hsl(228, 16%, 91%)',
  dim: 'hsl(228,11%,41%)',   // --text-dim equivalent
  faint: 'hsl(225,10%,63%)', // --text-faint equivalent
  dark: 'hsl(230,28%,14%)',  // --text equivalent
  mono: 'JetBrains Mono',
  sans: 'Outfit',
};
var STATS_THEME = {
  tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', borderWidth: 1, textStyle: { color: '#e8eaf0', fontFamily: _T.sans, fontSize: 12 } },
  axisLabel: { color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
  axisLine: { lineStyle: { color: 'hsl(228,16%,91%)' } },
  splitLine: { lineStyle: { color: 'hsl(228,16%,93%)' } },
  // Reusable label presets for chart functions
  catLabel: { color: _T.dim, fontFamily: _T.sans, fontSize: 11 },
  barLabel: { show: true, position: 'right', color: _T.dim, fontFamily: _T.mono, fontSize: 10 },
};
var STATS_COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#ef4444','#f97316','#14b8a6','#a855f7'];
var DEFAULT_LEVEL_HIERARCHY = [
  {label:'Entry Level', keywords:'entry level,entry-level,junior,jr,new grad,graduate'},
  {label:'Associate', keywords:'associate,assoc'},
  {label:'Mid', keywords:'mid level,mid-level,intermediate'},
  {label:'Senior', keywords:'senior,sr'},
  {label:'Staff', keywords:'staff'},
  {label:'Lead', keywords:'lead,team lead'},
  {label:'Principal', keywords:'principal,distinguished,fellow'},
  {label:'Manager', keywords:'manager,engineering manager,mgr'},
  {label:'Director', keywords:'director'},
  {label:'VP', keywords:'vp,vice president'},
  {label:'C-Suite', keywords:'cto,cfo,ceo,coo,cio,chief,c-suite,head of'},
];
var STATS_COLUMNS = 'greenhouse_id,ats_source,title,company_name,company_slug,salary_min,salary_max,salary_currency,location,loc_type,loc_state,loc_city,first_seen_at,industry';

// ─── CS-014: CX-09 — Lazy-load ECharts on first Stats tab open ───
var _echartsLoaded = false;
var _echartsLoading = false;
function loadECharts(cb) {
  if (_echartsLoaded && typeof echarts !== 'undefined') { cb(); return; }
  if (_echartsLoading) { var _iv = setInterval(function() { if (_echartsLoaded) { clearInterval(_iv); cb(); } }, 100); return; }
  _echartsLoading = true;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js';
  s.onload = function() { _echartsLoaded = true; cb(); };
  s.onerror = function() { _echartsLoading = false; console.error('[Stats] Failed to load ECharts'); };
  document.head.appendChild(s);
}

// ─── Init ───
function initStatsPage() {
  var page = document.getElementById('page-stats');
  if (!page || !page.classList.contains('active')) return;
  if (statsInitialized) { refreshStatsCharts(); return; }
  // CS-014: lazy-load ECharts before initializing charts
  loadECharts(function() {
    statsInitialized = true;
    renderFilterPills();
    initCompareToggle();
    fetchAndRenderStats();
    window.addEventListener('resize', statsResizeAll);

    // P13-06: Start data value assessment timer (shows after 10s viewing)
    if (typeof startDataViewTimer === 'function') startDataViewTimer('stats_charts');
  });
}

// ─── Filter Pills (CSS classes only, no inline styles) ───
function renderFilterPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  container.innerHTML = '';
  var isAll = statsSelectedFilters.includes('__all__');

  // "All" pill — no hamburger icon
  var allPill = document.createElement('button');
  allPill.className = 'stats-fpill' + (isAll ? ' active' : '');
  allPill.textContent = 'All';
  allPill.style.setProperty('--pill-color', 'var(--accent)');
  allPill.addEventListener('click', function() {
    statsSelectedFilters = ['__all__'];
    persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
  });
  container.appendChild(allPill);

  savedFilters.forEach(function(sf, idx) {
    var pill = document.createElement('button');
    var color = filterColors[idx % filterColors.length];
    var isActive = isAll || statsSelectedFilters.includes(String(idx));
    pill.className = 'stats-fpill' + (isActive ? ' active' : '');
    pill.style.setProperty('--pill-color', color);

    // Colored dot
    var dot = document.createElement('span');
    dot.className = 'stats-fpill-dot';
    dot.style.background = color;
    pill.appendChild(dot);
    pill.appendChild(document.createTextNode(sf.name || ('Filter ' + (idx + 1))));

    pill.addEventListener('click', function() {
      var id = String(idx);
      statsSelectedFilters = statsSelectedFilters.filter(function(f) { return f !== '__all__'; });
      var pos = statsSelectedFilters.indexOf(id);
      if (pos > -1) statsSelectedFilters.splice(pos, 1);
      else statsSelectedFilters.push(id);
      if (statsSelectedFilters.length === 0) statsSelectedFilters = ['__all__'];
      persistFilterSelection(); renderFilterPills(); debouncedFetchAndRender();
    });
    container.appendChild(pill);
  });
}

function persistFilterSelection() { localStorage.setItem('bj_stats_filters', JSON.stringify(statsSelectedFilters)); }

// ─── A15 S6 v6.62: Source pill counts from mv_job_feed_counts ───
// Shows per-ATS-source job counts as small chips in the stats filter bar (All mode only)
var _sourceCountsRendered = false;
var _sourcePillColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6' };
var _sourcePillLabels = { 'greenhouse':'Greenhouse', 'lever':'Lever', 'ashby':'Ashby', 'workable':'Workable', 'recruitee':'Recruitee', 'usajobs':'USAJobs' };

async function renderSourceCountPills() {
  var container = document.getElementById('stats-filter-pills');
  if (!container) return;
  // Remove old source pills
  var oldPills = container.querySelectorAll('.stats-source-pill');
  for (var i = 0; i < oldPills.length; i++) oldPills[i].remove();
  // Only show in All mode
  if (!statsSelectedFilters.includes('__all__')) { _sourceCountsRendered = false; return; }

  var totals = await fetchSourceTotalsFromMV();
  if (!totals) return;

  // Sort sources by job count descending
  var sources = Object.keys(totals).sort(function(a, b) { return totals[b].jobs - totals[a].jobs; });

  // Insert a separator dot before source pills
  var sep = document.createElement('span');
  sep.className = 'stats-source-pill';
  sep.style.cssText = 'width:3px;height:3px;border-radius:50%;background:var(--border);margin:0 2px;align-self:center;';
  // Insert before MV freshness badge if it exists, else append
  var freshBadge = document.getElementById('stats-mv-freshness');
  if (freshBadge) container.insertBefore(sep, freshBadge);
  else container.appendChild(sep);

  for (var s = 0; s < sources.length; s++) {
    var src = sources[s];
    var count = totals[src].jobs;
    if (count === 0) continue;
    var chip = document.createElement('span');
    chip.className = 'stats-source-pill';
    chip.title = (_sourcePillLabels[src] || src) + ': ' + count.toLocaleString() + ' jobs (' + totals[src].withSalary.toLocaleString() + ' with salary)';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:10px;font-size:10px;font-family:var(--mono);color:var(--text-dim);border:1px solid var(--border);background:var(--bg-card);cursor:default;white-space:nowrap;';
    var dot = document.createElement('span');
    dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:' + (_sourcePillColors[src] || '#475569') + ';flex-shrink:0;';
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode((_sourcePillLabels[src] || src) + ' ' + _formatCompact(count)));
    if (freshBadge) container.insertBefore(chip, freshBadge);
    else container.appendChild(chip);
  }
  _sourceCountsRendered = true;
}

function _formatCompact(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function initCompareToggle() {
  var sel = document.getElementById('stats-compare-toggle');
  if (!sel) return;
  sel.disabled = false;
  sel.addEventListener('change', function() {
    statsCompareMode = sel.value === 'compare';
    debouncedFetchAndRender();
  });
}

async function fetchAndRenderCompare(filterA, filterB) {
  var rowsA = await fetchFilterData(filterA.sf);
  var rowsB = await fetchFilterData(filterB.sf);
  var statsA = aggregateStats(rowsA);
  var statsB = aggregateStats(rowsB);
  var colorA = filterColors[filterA.idx % filterColors.length];
  var colorB = filterColors[filterB.idx % filterColors.length];
  var nameA = filterA.sf.name || ('Filter ' + (filterA.idx + 1));
  var nameB = filterB.sf.name || ('Filter ' + (filterB.idx + 1));
  return { a: { stats: statsA, color: colorA, name: nameA }, b: { stats: statsB, color: colorB, name: nameB } };
}

// ─── Data ───
function debouncedFetchAndRender() { clearTimeout(_statsDebounce); _statsDebounce = setTimeout(fetchAndRenderStats, 300); }

async function fetchAndRenderStats() {
  showStatsLoading(true);
  try {
    var configs = getSelectedFilterConfigs();
    if (configs.length === 0) { showEmptyState('no-filters'); return; }

    // Compare mode: exactly 2 filters selected
    if (statsCompareMode) {
      var selected = configs.filter(function(c) { return statsSelectedFilters.includes(String(c.idx)); });
      if (selected.length !== 2 && !statsSelectedFilters.includes('__all__')) {
        showStatsLoading(false);
        var warn = document.getElementById('stats-compare-warn');
        if (warn) { warn.textContent = 'Select exactly 2 filters to compare'; warn.style.display = ''; }
        return;
      }
      if (statsSelectedFilters.includes('__all__') || selected.length !== 2) {
        showStatsLoading(false);
        var warn = document.getElementById('stats-compare-warn');
        if (warn) { warn.textContent = 'Select exactly 2 individual filters to compare (not "All")'; warn.style.display = ''; }
        return;
      }
      var cmp = await fetchAndRenderCompare(selected[0], selected[1]);
      showStatsLoading(false);
      var warnEl = document.getElementById('stats-compare-warn');
      if (warnEl) warnEl.style.display = 'none';
      renderCompareTimeline(cmp);
      renderCompareSalary(cmp);
      renderCompareWorkType(cmp);
      renderCompareTopCompanies(cmp);
      renderCompareStatCards(cmp);
      renderSeniorityBars(cmp.a.stats); // Single series fallback for complex charts
      renderSalaryByLevel(cmp.a.stats);
      renderPostingAge(cmp.a.stats);
      renderGeoMap(cmp.a.stats, configs);
      renderIndustryBars(cmp.a.stats);
      renderSourceBreakdown(cmp.a.stats);
      return;
    }

    // Hide compare warning
    var warnEl = document.getElementById('stats-compare-warn');
    if (warnEl) warnEl.style.display = 'none';
    var allRows = [], anyCapped = false;
    for (var i = 0; i < configs.length; i++) {
      var sf = configs[i].sf, idx = configs[i].idx;
      var ck = JSON.stringify(sf) + '_' + idx;
      var cached = statsCache[ck];
      if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
        allRows = allRows.concat(cached.rows);
        if (cached.capped) anyCapped = true;
        continue;
      }
      var rows = await fetchFilterData(sf);
      var capped = rows.length >= STATS_ROW_CAP;
      statsCache[ck] = { rows: rows, timestamp: Date.now(), capped: capped };
      allRows = allRows.concat(rows);
      if (capped) anyCapped = true;
    }
    var seen = {}, deduped = [];
    for (var j = 0; j < allRows.length; j++) {
      var r = allRows[j], k = r.greenhouse_id + ':' + r.ats_source;
      if (!seen[k]) { seen[k] = true; deduped.push(r); if (deduped.length >= STATS_DEDUP_CAP) break; }
    }
    if (deduped.length === 0) { showEmptyState('no-results'); return; }
    var stats = aggregateStats(deduped);
    showStatsLoading(false);

    // A15 Session 5: When "All" filters selected, use MV data for stat cards + source charts
    var isAllMode = statsSelectedFilters.includes('__all__');
    var mvSourceTotals = null, mvSourceTimeline = null, mvLandingStats = null;
    if (isAllMode) {
      try {
        var mvResults = await Promise.all([fetchSourceTotalsFromMV(), fetchSourceBreakdownFromMV(), fetchLandingStatsFromMV()]);
        mvSourceTotals = mvResults[0];
        mvSourceTimeline = mvResults[1];
        mvLandingStats = mvResults[2];
      } catch(e) { reportError('stats', e); console.warn('[Stats] MV fetch failed, falling back to row data:', e.message); }
    }

    // A15 S5: Render stat cards from MV when in All mode (instant, no row aggregation)
    if (mvLandingStats) {
      renderStatCardsFromMV(mvLandingStats);
      renderMVFreshnessNotice(mvLandingStats.refreshed_at);
    } else {
      renderStatCards(stats);
      hideMVFreshnessNotice();
    }

    // A15 S6 v6.62: Render source count pills from MV (All mode)
    renderSourceCountPills();

    // Use MV-powered source timeline when available, otherwise standard
    if (mvSourceTimeline && mvSourceTimeline.length > 0) {
      renderSourceTimelineFromMV(mvSourceTimeline);
    } else {
      renderTimeline(stats);
    }

    renderSalaryDist(stats);
    renderSeniorityBars(stats);
    renderTopCompanies(stats);
    renderWorkType(stats);
    renderPostingAge(stats);
    renderGeoMap(stats, configs);
    renderSalaryByLevel(stats);
    renderIndustryBars(stats);

    // Use MV-powered source breakdown when available, otherwise standard
    if (mvSourceTotals) {
      renderSourceBreakdownFromMV(mvSourceTotals);
    } else {
      renderSourceBreakdown(stats);
    }
    var notice = document.getElementById('stats-cap-notice');
    if (notice) {
      if (anyCapped) { notice.textContent = 'Based on ' + deduped.length.toLocaleString() + ' most recent matches'; notice.style.display = ''; }
      else { notice.style.display = 'none'; }
    }
  } catch (err) { reportError('stats', err); console.error('[Stats] Fetch error:', err); toastError('Failed to load stats data'); showEmptyState('error'); }
}

function getSelectedFilterConfigs() {
  if (savedFilters.length === 0) return [];
  if (statsSelectedFilters.includes('__all__')) return savedFilters.map(function(sf, i) { return {sf:sf, idx:i}; });
  return statsSelectedFilters.map(function(id) { return {sf: savedFilters[Number(id)], idx: Number(id)}; }).filter(function(x) { return x.sf; });
}

async function fetchFilterData(sf) {
  try {
    var tuning = safeReadLS('bj_tuning', {});
    var locIds = await getLocationMatchIds(sf.wherePills || [], sf.whereNotPills || [], tuning, sf.includeRemote);
    // A14 Session 3: wrap stats data queries in cachedQuery
    var cKey = _filterCacheKey('stats:page', sf);
    var cResult = await cachedQuery(cKey, function() {
      var base = sb.from('ats_jobs').select(STATS_COLUMNS);
      var q = buildFilterQuery(sf, base, locIds);
      // Exclude user-hidden jobs to match feed counts
      var hiddenIds = safeReadLS('bj_hidden', []);
      if (hiddenIds.length > 0) { q = q.not('greenhouse_id', 'in', '(' + hiddenIds.join(',') + ')'); }
      q = q.order('first_seen_at', { ascending: false }).limit(STATS_ROW_CAP);
      return q;
    });
    if (cResult && cResult.error) { console.error('[Stats] Query error:', cResult.error); toastWarning('Stats query failed'); return []; }
    return (cResult && cResult.data) || [];
  } catch (e) { reportError('stats', e); console.error('[Stats] fetchFilterData:', e); toastWarning('Stats data failed to load'); return []; }
}

// ─── Aggregation ───
function aggregateStats(rows) {
  var s = { total: rows.length, medianSalary: null, seniorPct: 0, remotePct: 0, companyCount: 0,
    levelCounts: {}, salaryBuckets: {}, topCompanies: [], workTypeCounts: {}, timelineBuckets: {},
    salaryByLevel: {}, industryCounts: {}, salaryJobCount: 0, industryNonNull: 0, sourceCounts: {} };

  var cos = {}; rows.forEach(function(r) { var ck = r.company_slug || r.company_name; if (ck) cos[ck] = true; });
  s.companyCount = Object.keys(cos).length;

  // Seniority + salary-by-level in one pass
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  hier.map(function(l) { return l.label; }).forEach(function(l) { s.levelCounts[l] = 0; });
  s.levelCounts['Other'] = 0;
  var seniorSet = {Senior:1,Staff:1,Lead:1,Principal:1,Manager:1,Director:1,VP:1,'C-Suite':1,'Sr Director':1,'Assoc Director':1,'Sr Manager':1};
  var seniorN = 0;
  var salByLvl = {};

  rows.forEach(function(r) {
    var lvl = getJobLevel(r.title, hier);
    var label = lvl ? lvl.label : 'Other';
    s.levelCounts[label] = (s.levelCounts[label] || 0) + 1;
    if (lvl && seniorSet[lvl.label]) seniorN++;
    var sal = (r.salary_min && r.salary_max) ? (r.salary_min + r.salary_max) / 2 : (r.salary_min || r.salary_max || 0);
    if (sal > 0) { if (!salByLvl[label]) salByLvl[label] = []; salByLvl[label].push(sal); }
  });
  s.seniorPct = rows.length > 0 ? Math.round((seniorN / rows.length) * 100) : 0;
  Object.keys(salByLvl).forEach(function(label) {
    var arr = salByLvl[label].sort(function(a,b){return a-b;});
    var n = arr.length;
    var p = function(pct) { var i = Math.floor(pct * (n - 1)); var f = pct * (n - 1) - i; return Math.round(arr[i] + (arr[Math.min(i+1,n-1)] - arr[i]) * f); };
    s.salaryByLevel[label] = { avg: Math.round(arr.reduce(function(a,b){return a+b;},0) / n), p15: p(0.15), median: p(0.5), p85: p(0.85), count: n };
  });

  // Remote
  var remN = 0;
  rows.forEach(function(r) { if (r.loc_type === 'remote' || (r.location||'').toLowerCase().startsWith('remote')) remN++; });
  s.remotePct = rows.length > 0 ? Math.round((remN / rows.length) * 100) : 0;

  // Salary distribution
  var sals = [];
  rows.forEach(function(r) { var v = r.salary_min || r.salary_max; if (v && v > 0) sals.push(v); });
  s.salaryJobCount = sals.length;
  sals.sort(function(a,b) { return a-b; });
  if (sals.length > 0) {
    var mid = Math.floor(sals.length / 2);
    s.medianSalary = sals.length % 2 === 0 ? Math.round((sals[mid-1]+sals[mid])/2) : sals[mid];
  }
  rows.forEach(function(r) {
    var v = r.salary_min || r.salary_max; if (!v || v <= 0) return;
    var b = Math.floor(v / 25000) * 25000;
    s.salaryBuckets['$' + (b/1000) + 'K'] = (s.salaryBuckets['$' + (b/1000) + 'K']||0) + 1;
  });

  // Top companies (top 10 per brief)
  var cc = {};
  rows.forEach(function(r) { if (r.company_name) cc[r.company_name] = (cc[r.company_name]||0) + 1; });
  s.topCompanies = Object.entries(cc).sort(function(a,b) { return b[1]-a[1]; }).slice(0, 10);

  // Work type
  s.workTypeCounts = { 'Remote': 0, 'On-site': 0, 'Hybrid': 0, 'Unspecified': 0 };
  rows.forEach(function(r) {
    var loc = (r.location || '').toLowerCase();
    var lt = (r.loc_type || '').toLowerCase();
    if (lt === 'remote' || loc.startsWith('remote')) s.workTypeCounts['Remote']++;
    else if (lt === 'hybrid' || loc.includes('hybrid')) s.workTypeCounts['Hybrid']++;
    else if (r.location && r.location.trim()) s.workTypeCounts['On-site']++;
    else s.workTypeCounts['Unspecified']++;
  });

  // Timeline — 12 complete weeks + WTD 13th (unless today is last day of week period)
  var weekMap = {};
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var d = new Date(r.first_seen_at);
    var day = d.getUTCDay();
    var mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day === 0 ? 6 : day - 1)));
    var mk = mon.toISOString().slice(0, 10);
    weekMap[mk] = (weekMap[mk]||0) + 1;
  });
  var now = new Date();
  var todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  var todayDay = todayUTC.getUTCDay();
  var thisMonday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate() - (todayDay === 0 ? 6 : todayDay - 1)));
  var isSunday = todayDay === 0;
  // 12 complete past weeks
  for (var w = 12; w >= 1; w--) {
    var weekStart = new Date(thisMonday.getTime() - (w * 7 * 86400000));
    var wk = weekStart.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
  }
  // 13th slot: WTD (current week) unless today is Sunday (last day = week complete)
  if (!isSunday) {
    var wtdKey = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wtdKey] = weekMap[wtdKey] || 0;
    s.timelineWtdKey = wtdKey;
  } else {
    // Today is Sunday — this week is complete, show it as the 13th complete week
    var wk = thisMonday.toISOString().slice(0, 10);
    s.timelineBuckets[wk] = weekMap[wk] || 0;
    s.timelineWtdKey = null;
  }

  // Industry
  rows.forEach(function(r) {
    if (r.industry && r.industry.trim()) {
      s.industryNonNull++;
      s.industryCounts[r.industry.trim()] = (s.industryCounts[r.industry.trim()]||0) + 1;
    }
  });

  // ATS Source
  rows.forEach(function(r) {
    var src = r.ats_source || 'Unknown';
    s.sourceCounts[src] = (s.sourceCounts[src]||0) + 1;
  });

  // Posting age distribution (days since first_seen_at)
  s.postingAgeBuckets = {'0-7 days':0,'8-14 days':0,'15-30 days':0,'31-60 days':0,'61-90 days':0,'90+ days':0};
  var nowMs = Date.now();
  rows.forEach(function(r) {
    if (!r.first_seen_at) return;
    var age = Math.floor((nowMs - new Date(r.first_seen_at).getTime()) / 86400000);
    if (age <= 7) s.postingAgeBuckets['0-7 days']++;
    else if (age <= 14) s.postingAgeBuckets['8-14 days']++;
    else if (age <= 30) s.postingAgeBuckets['15-30 days']++;
    else if (age <= 60) s.postingAgeBuckets['31-60 days']++;
    else if (age <= 90) s.postingAgeBuckets['61-90 days']++;
    else s.postingAgeBuckets['90+ days']++;
  });

  // Location aggregation for map + metro list (US only)
  s.stateCounts = {};
  s.cityCounts = {};
  s.locationCounts = {};
  s.locationsTotal = 0;
  var US_ST = {AL:1,AK:1,AZ:1,AR:1,CA:1,CO:1,CT:1,DC:1,DE:1,FL:1,GA:1,HI:1,ID:1,IL:1,IN:1,IA:1,KS:1,KY:1,LA:1,ME:1,MD:1,MA:1,MI:1,MN:1,MS:1,MO:1,MT:1,NE:1,NV:1,NH:1,NJ:1,NM:1,NY:1,NC:1,ND:1,OH:1,OK:1,OR:1,PA:1,RI:1,SC:1,SD:1,TN:1,TX:1,UT:1,VT:1,VA:1,WA:1,WV:1,WI:1,WY:1};
  function normalizeLocation(raw) {
    var loc = raw.toLowerCase().trim();
    // Strip country suffixes
    loc = loc.replace(/,?\s*united states$/,'').replace(/,?\s*usa$/,'').replace(/,?\s*us$/,'').trim();
    // Handle remote variants
    if (loc === 'remote' || loc === '') return null;
    if (/^remote\s*[-–—]\s*/.test(loc)) loc = loc.replace(/^remote\s*[-–—]\s*/,'').trim();
    if (/^remote,?\s*/.test(loc) && loc !== 'remote') loc = loc.replace(/^remote,?\s*/,'').trim();
    if (loc === '' || loc === 'remote') return null;
    // Handle "(remote)" suffix
    loc = loc.replace(/\s*\(remote\)\s*$/,'').trim();
    // Multi-location: split on semicolons and take first
    if (loc.indexOf(';') !== -1) loc = loc.split(';')[0].trim();
    if (!loc) return null;
    return loc;
  }
  rows.forEach(function(r) {
    var raw = (r.location || '').trim();
    var loc = normalizeLocation(raw);
    if (loc) {
      s.locationsTotal++;
      s.locationCounts[loc] = (s.locationCounts[loc]||0) + 1;
    }
    if (r.loc_state && US_ST[r.loc_state]) {
      s.stateCounts[r.loc_state] = (s.stateCounts[r.loc_state]||0) + 1;
      if (r.loc_city) {
        var key = r.loc_city + ', ' + r.loc_state;
        s.cityCounts[key] = (s.cityCounts[key]||0) + 1;
      }
    }
  });

  return s;
}

// ─── Stat Cards ───
function renderStatCards(stats) {
  var fmt = function(n) { return n != null ? n.toLocaleString() : '\u2014'; };
  var fmtK = function(n) { if (n == null) return 'N/A'; return n >= 1000 ? ('$' + Math.round(n/1000) + 'K') : ('$' + fmt(n)); };
  setText('#sc-total', fmt(stats.total));
  setText('#sc-salary', fmtK(stats.medianSalary));
  // Restore label in case it was changed by MV mode
  var salaryLabel = document.querySelector('#sc-salary');
  if (salaryLabel && salaryLabel.nextElementSibling) salaryLabel.nextElementSibling.textContent = 'Median Salary';
  setText('#sc-senior', stats.seniorPct + '%');
  setText('#sc-remote', stats.remotePct + '%');
  setText('#sc-companies', fmt(stats.companyCount));
}
function setText(sel, val) { var el = document.querySelector(sel); if (el) el.textContent = val; }

// ─── Chart Helpers ───
function getOrCreateChart(id) {
  var el = document.getElementById(id.replace('#',''));
  if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return null;
  if (statsCharts[id]) return statsCharts[id];
  var c = echarts.init(el, null, { renderer: 'canvas' });
  statsCharts[id] = c;
  return c;
}
function ttip() { return { backgroundColor:STATS_THEME.tooltip.backgroundColor, borderColor:STATS_THEME.tooltip.borderColor, borderWidth:1, textStyle:STATS_THEME.tooltip.textStyle }; }
function truncName(s, max) { return s && s.length > max ? s.slice(0, max) + '\u2026' : s; }
function emptyChart(chart, msg) {
  chart.setOption({ graphic:[{type:'text',left:'center',top:'middle',style:{text:msg,fill:_T.dim,fontSize:12,fontFamily:_T.sans,textAlign:'center',lineHeight:20}}], xAxis:{show:false},yAxis:{show:false},series:[] }, true);
}

// ─── C1: Job Count Over Time — bars, last 12 weeks, continuous ───
function renderTimeline(stats) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sorted = Object.entries(stats.timelineBuckets).sort(function(a,b){ return a[0].localeCompare(b[0]); });
  // Compute cumulative
  var cum = [], running = 0;
  sorted.forEach(function(e) { running += e[1]; cum.push(running); });
  chart.setOption({
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var d=new Date(p[0].name); var isWtd = stats.timelineWtdKey && p[0].name === stats.timelineWtdKey; var cumVal=p[1]?p[1].value:0; return '<b>'+(isWtd?'WTD: ':'Week of ')+d.toLocaleDateString('en-US',{month:'short',day:'numeric'})+'</b><br/>'+p[0].value+' new jobs'+(isWtd?' (so far)':'')+'<br/>'+cumVal+' cumulative'; }}, ttip()),
    grid: { top:30, right:50, bottom:30, left:50 },
    xAxis: { type:'category', data:sorted.map(function(e){return e[0];}),
      axisLabel: { color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0,
        formatter:function(v){ var d=new Date(v); var label=d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); return stats.timelineWtdKey && v===stats.timelineWtdKey ? label+'\n(WTD)' : label; }},
      axisLine: STATS_THEME.axisLine },
    yAxis: [
      { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
      { type:'value', position:'right', axisLabel:{ color:'rgba(99,102,241,0.6)', fontFamily:_T.mono, fontSize:10, formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;} }, splitLine:{show:false}, axisLine:{show:false}, axisTick:{show:false} }
    ],
    series: [{ type:'bar', yAxisIndex:0, data:sorted.map(function(e){
        var isWtd = stats.timelineWtdKey && e[0] === stats.timelineWtdKey;
        return { value:e[1], itemStyle:{ color: isWtd
          ? new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#818cf8'},{offset:1,color:'rgba(129,140,248,0.3)'}])
          : new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'#60a5fa'},{offset:1,color:'rgba(59,130,246,0.4)'}]),
          borderRadius:[3,3,0,0], borderType: isWtd ? 'dashed' : 'solid' }};
      }),
      barMaxWidth:28 },
      { type:'line', yAxisIndex:1, data:cum, smooth:0.3, symbol:'none',
        lineStyle:{color:'rgba(99,102,241,0.7)',width:2},
        areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(99,102,241,0.15)'},{offset:1,color:'rgba(99,102,241,0)'}])} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C2: Salary Distribution — pie chart, ordered low→high, salary-data colors ───
function renderSalaryDist(stats) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var sub = document.getElementById('chart-salary-sub');
  if (sub) sub.textContent = stats.salaryJobCount + ' of ' + stats.total + ' jobs have salary data';

  var entries = Object.entries(stats.salaryBuckets).map(function(e) {
    return { label:e[0], count:e[1], num:parseInt(e[0].replace('$','').replace('K',''))*1000 };
  }).sort(function(a,b){return a.num-b.num;}).filter(function(e){return e.num>=25000 && e.num<=500000;});

  if (entries.length < 3) {
    emptyChart(chart, 'Not enough salary data for this filter.\nTry broadening your search.');
    return;
  }

  // Color gradient: cool (low salary) → warm (high salary), matching salary-data page
  var salaryColors = ['#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef','#ec4899','#f43f5e','#ef4444','#f97316','#f59e0b','#eab308','#22c55e'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.mono,fontSize:10},
      formatter:function(name){var e=entries.find(function(x){return x.label===name;}); return name+(e?' ('+e.count+')':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:entries.map(function(e,i){return {name:e.label, value:e.count, itemStyle:{color:salaryColors[i%salaryColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C3: Seniority — pie chart, ordered Entry→C-Suite. Suppress when Unclassified > 80% ───
function renderSeniorityBars(stats) {
  var chart = getOrCreateChart('#chart-funnel'); if (!chart) return;
  var otherCount = stats.levelCounts['Other'] || 0;
  var unclPct = stats.total > 0 ? (otherCount / stats.total) * 100 : 100;

  if (unclPct > 95) {
    emptyChart(chart, 'Most jobs haven\'t been classified by seniority.\nConfigure your level keywords in\nTuning \u2192 Level Hierarchy to improve this.');
    return;
  }

  // Ordered Entry → C-Suite (correct career ladder)
  var SENIORITY_ORDER = ['Entry','Analyst','Associate','Mid','Senior','Sr Manager','Manager','Head','Lead','Principal','Staff','Assoc Director','Director','Sr Director','VP','C-Suite'];
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var data = SENIORITY_ORDER.map(function(label) {
    var count = stats.levelCounts[label] || 0;
    return count > 0 ? {name:label, value:count} : null;
  }).filter(Boolean);
  // Add any levels not in the fixed order
  hier.forEach(function(l) {
    if (SENIORITY_ORDER.indexOf(l.label) === -1 && stats.levelCounts[l.label] > 0) {
      data.push({name:l.label, value:stats.levelCounts[l.label]});
    }
  });
  if (otherCount > 0 && unclPct <= 95) data.push({name:'Other', value:otherCount});

  if (data.length === 0) { emptyChart(chart, 'No seniority data'); return; }

  // Colors: cool (entry) → warm (C-suite), matching salary-data page seniority palette
  var senColors = ['#3b82f6','#6366f1','#8b5cf6','#22c55e','#14b8a6','#f59e0b','#f97316','#ec4899','#ef4444','#dc2626','#94a3b8'];

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){ var pct=stats.total>0?Math.round(p.value/stats.total*100):0; return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+pct+'%)'; }}, ttip()),
    legend: { orient:'vertical', right:4, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:10},
      formatter:function(name){var d=data.find(function(x){return x.name===name;}); var total=data.reduce(function(a,b){return a+b.value;},0); var pct=d&&total>0?Math.round(d.value/total*100):0; return name+(d?' ('+pct+'%)':'');}},
    series: [{ type:'pie', radius:['38%','68%'], center:['35%','50%'],
      data:data.map(function(d,i){return {name:d.name, value:d.value, itemStyle:{color:senColors[i%senColors.length]}};}),
      label:{show:false},
      emphasis:{label:{show:true,fontSize:13,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      itemStyle:{borderColor:'#fff',borderWidth:2} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C5: Industry Treemap — same categories as Data Lab ───
function renderTopCompanies(stats) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  var ind = stats.industryCounts;
  var sorted = Object.entries(ind).sort(function(a,b){return b[1]-a[1];});
  
  if (sorted.length === 0) {
    emptyChart(chart, 'No industry data available for this filter.');
    return;
  }

  var treePAL = ['#3b82f6','#22c55e','#a855f7','#f59e0b','#06b6d4','#ec4899','#6366f1','#ef4444','#14b8a6','#f97316','#8b5cf6','#0ea5e9','#d946ef','#84cc16','#e11d48'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+Number(p.value).toLocaleString()+' jobs';}}, ttip()),
    series: [{ type:'treemap',
      data:sorted.map(function(d,i){return {name:d[0], value:d[1], itemStyle:{color:treePAL[i%treePAL.length], borderColor:'#fff', borderWidth:2}};}),
      label:{fontSize:12,fontFamily:'Outfit',fontWeight:500,color:'#fff',formatter:function(p){return p.name+'\n'+Number(p.value).toLocaleString();}},
      breadcrumb:{show:false}, roam:false, nodeClick:false,
      levels:[{itemStyle:{borderRadius:8}}],
      animationDuration:800 }],
  }, true);
}

// ─── C7: Work Arrangement — donut (correct for categorical composition) ───
function renderWorkType(stats) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var wt = stats.workTypeCounts;
  var typeColors = { 'Remote':'#22c55e', 'On-site':'#6366f1', 'Hybrid':'#f59e0b', 'Unspecified':'#334155' };
  var total = Object.values(wt).reduce(function(a,b){return a+b;},0);
  var unspecPct = total > 0 ? (wt['Unspecified'] / total) * 100 : 0;

  // Suppress Unspecified segment when > 50%
  var order = ['Remote','On-site','Hybrid'];
  if (unspecPct <= 50) order.push('Unspecified');

  var data = order.filter(function(t){return wt[t]>0;})
    .map(function(t){return {name:t, value:wt[t], itemStyle:{color:typeColors[t]}};});
  var displayTotal = data.reduce(function(a,d){return a+d.value;},0);

  if (data.length === 0) { emptyChart(chart, 'No location data available'); return; }

  var noteText = unspecPct > 50 ? 'Location type not specified for many jobs' : '';
  chart.setOption({
    graphic: noteText ? [{type:'text',left:'center',bottom:5,style:{text:noteText,fill:_T.faint,fontSize:10,fontFamily:_T.sans}}] : [],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value+' jobs ('+p.percent.toFixed(1)+'%)';}}, ttip()),
    legend: { orient:'vertical', right:10, top:'center', textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:12},
      formatter:function(name){ var v=wt[name]||0; var pct=displayTotal>0?Math.round(v/displayTotal*100):0; return name+'  '+pct+'%'; }},
    series: [{ type:'pie', radius:['42%','70%'], center:['35%','50%'], avoidLabelOverlap:true,
      label:{show:false},
      emphasis:{label:{show:true,fontSize:14,fontFamily:_T.sans,fontWeight:'600',color:_T.dark}},
      data:data }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C6: Salary by Level — threshold: 100+ jobs AND 3+ levels with 5+ salary points ───
function renderSalaryByLevel(stats) {
  var card = document.getElementById('chart-salary-level');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var salLvl = stats.salaryByLevel;

  var qualifiedLevels = Object.keys(salLvl).filter(function(l){ return salLvl[l].count >= 5; });
  var meetsThreshold = stats.total >= 100 && qualifiedLevels.length >= 3;

  if (!meetsThreshold) {
    if (cardWrap) cardWrap.style.display = 'none';
    return;
  }
  if (cardWrap) cardWrap.style.display = '';

  var chart = getOrCreateChart('#chart-salary-level'); if (!chart) return;
  var hier = (levelHierarchy && levelHierarchy.length > 0) ? levelHierarchy : DEFAULT_LEVEL_HIERARCHY;
  var ordered = hier.map(function(l){return l.label;}).filter(function(l){return salLvl[l] && salLvl[l].count>=5;})
    .map(function(l){return {label:l, avg:salLvl[l].avg, p15:salLvl[l].p15, median:salLvl[l].median, p85:salLvl[l].p85, count:salLvl[l].count};});
  if (salLvl['Other'] && salLvl['Other'].count >= 5) ordered.push({label:'Other', avg:salLvl['Other'].avg, p15:salLvl['Other'].p15, median:salLvl['Other'].median, p85:salLvl['Other'].p85, count:salLvl['Other'].count});

  var overallAvg = 0, totalCount = 0;
  ordered.forEach(function(d){overallAvg += d.avg * d.count; totalCount += d.count;});
  overallAvg = totalCount > 0 ? Math.round(overallAvg / totalCount) : 0;

  var barColors = ['#6366f1','#818cf8','#a78bfa','#22c55e','#34d399','#f59e0b','#fbbf24','#ec4899','#f97316','#ef4444','#06b6d4','#8b5cf6'];
  var fK = function(v){return '$'+Math.round(v/1000)+'K';};

  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){ var idx=p[0].dataIndex; var d=ordered[idx]; if(!d)return ''; return '<b>'+d.label+'</b> ('+d.count+' jobs)<br/>P85: '+fK(d.p85)+'<br/>Median: <b>'+fK(d.median)+'</b><br/>P15: '+fK(d.p15); }}, ttip()),
    grid: { top:30, right:30, bottom:40, left:60 },
    xAxis: { type:'category', data:ordered.map(function(d){return d.label;}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, rotate:ordered.length>8?30:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10,
      formatter:function(v){return fK(v);}}, splitLine:STATS_THEME.splitLine },
    series: [
      { name:'P15 base', type:'bar', stack:'range', data:ordered.map(function(d){return {value:d.p15, itemStyle:{color:'transparent'}};}),
        barMaxWidth:40, itemStyle:{borderRadius:0} },
      { name:'Range', type:'bar', stack:'range', data:ordered.map(function(d,i){return {value:d.p85-d.p15, itemStyle:{color:barColors[i%barColors.length],opacity:0.35,borderRadius:[4,4,0,0]}};}),
        barMaxWidth:40 },
      { name:'Median', type:'scatter', symbol:'rect', symbolSize:function(v,p){return [36,3];},
        data:ordered.map(function(d,i){return {value:d.median, itemStyle:{color:barColors[i%barColors.length]}};}),
        z:10, label:{ show:ordered.length<=8, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
          formatter:function(p){return fK(p.value);}}}
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C8: Industry — threshold: industry non-null > 60% ───
function renderIndustryBars(stats) {
  var card = document.getElementById('chart-industry');
  var cardWrap = card ? card.closest('.stats-chart-card') : null;
  var coveragePct = stats.total > 0 ? (stats.industryNonNull / stats.total) * 100 : 0;

  if (cardWrap) cardWrap.style.display = '';
  if (coveragePct < 1) {
    emptyChart(chart || getOrCreateChart('#chart-industry'), 'Industry data available for ' + stats.industryNonNull + ' of ' + stats.total + ' jobs (' + Math.round(coveragePct) + '%). More enrichment coming soon.');
    return;
  }

  var chart = getOrCreateChart('#chart-industry'); if (!chart) return;
  var sorted = Object.entries(stats.industryCounts).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
  if (sorted.length === 0) { emptyChart(chart, 'No industry data available'); return; }

  var rev = sorted.slice().reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:160 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    yAxis: { type:'category', data:rev.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11, width:150, overflow:'truncate' }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:rev.map(function(e){return e[1];}),
      itemStyle:{ color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(34,197,94,0.3)'},{offset:1,color:'#22c55e'}]), borderRadius:[0,3,3,0] },
      barMaxWidth:18,
      label:STATS_THEME.barLabel}],
    animation:true, animationDuration:600,
  }, true);
}

// ─── C9: ATS Source Breakdown — donut ───
function renderSourceBreakdown(stats) {
  var chart = getOrCreateChart('#chart-source'); if (!chart) return;
  var src = stats.sourceCounts;
  var sorted = Object.entries(src).sort(function(a,b){return b[1]-a[1];});
  if (sorted.length === 0) { emptyChart(chart, 'No source data'); return; }
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6', 'Unknown':'#475569' };
  var total = sorted.reduce(function(a,e){return a+e[1];},0);
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'item',
      formatter:function(p){return '<b>'+p.name+'</b><br/>'+p.value.toLocaleString()+' jobs ('+((p.value/total)*100).toFixed(1)+'%)';}}, ttip()),
    series: [{ type:'pie', radius:['45%','72%'], center:['50%','55%'],
      data:sorted.map(function(e){
        var name = e[0].charAt(0).toUpperCase() + e[0].slice(1);
        return {name:name, value:e[1], itemStyle:{color:sourceColors[e[0]]||STATS_COLORS[sorted.indexOf(e)%STATS_COLORS.length]}};
      }),
      label:{fontSize:11,fontFamily:_T.sans,color:_T.dim,formatter:function(p){return p.name+' '+((p.value/total)*100).toFixed(0)+'%';}},
      emphasis:{itemStyle:{shadowBlur:10,shadowColor:'rgba(0,0,0,0.2)'}},
      animationType:'scale', animationDuration:600 }],
  }, true);
}

// ─── Posting Age Distribution — bar chart ───
function renderPostingAge(stats) {
  var chart = getOrCreateChart('#chart-posting-age'); if (!chart) return;
  var buckets = stats.postingAgeBuckets;
  var labels = ['0-7 days','8-14 days','15-30 days','31-60 days','61-90 days','90+ days'];
  var ageColors = ['#3b82f6','#6366f1','#8b5cf6','#f59e0b','#f97316','#ef4444'];
  
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:20, right:20, bottom:35, left:50 },
    xAxis: { type:'category', data:labels,
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:10, interval:0 },
      axisLine:STATS_THEME.axisLine },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [{ type:'bar', data:labels.map(function(l,i){return {value:buckets[l]||0, itemStyle:{color:ageColors[i], borderRadius:[3,3,0,0]}};}),
      barMaxWidth:36,
      label:{ show:true, position:'top', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value>0?p.value:'';}} }],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Geo Map + Top Metros/Cities ───
function renderGeoMap(stats, configs) {
  var mapEl = document.getElementById('chart-geo-map');
  var listEl = document.getElementById('chart-geo-list');
  var titleEl = document.getElementById('chart-geo-title');
  if (!mapEl) return;

  var stateCounts = stats.stateCounts || {};
  var cityCounts = stats.cityCounts || {};
  var locationCounts = stats.locationCounts || {};
  var stateEntries = Object.entries(stateCounts).sort(function(a,b){return b[1]-a[1];});
  var locationEntries = Object.entries(locationCounts).sort(function(a,b){return b[1]-a[1];});

  if (locationEntries.length === 0 && stateEntries.length === 0) {
    mapEl.innerHTML = '<div style="text-align:center;padding:80px 20px;color:'+_T.dim+';font-size:12px">No location data for this filter</div>';
    if (listEl) listEl.innerHTML = '';
    return;
  }

  // For small result sets (<75 jobs), show a clean list instead of a bar chart
  if (stats.total < 75) {
    // Destroy existing chart if any
    if (statsCharts['#chart-geo-map']) { statsCharts['#chart-geo-map'].dispose(); delete statsCharts['#chart-geo-map']; }
    if (titleEl) titleEl.textContent = 'Where Are the Jobs (' + stats.locationsTotal + ' of ' + stats.total + ' have locations)';
    var top20 = locationEntries.slice(0, 20);
    var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0">';
    top20.forEach(function(e, i) {
      html += '<div style="display:flex;justify-content:space-between;padding:10px 16px;border-bottom:1px solid '+_T.border+';font-size:13px;' + (i%2===0?'border-right:1px solid '+_T.border+';':'') + '">' +
        '<span style="color:'+_T.dim+'">' + e[0] + '</span>' +
        '<span style="font-weight:700;font-family:'+_T.mono+';color:'+_T.dark+'">' + e[1] + '</span></div>';
    });
    html += '</div>';
    if (stats.locationsTotal === 0) {
      html = '<div style="text-align:center;padding:60px 20px;color:'+_T.dim+';font-size:13px">All jobs in this filter are remote or have no location specified</div>';
    }
    mapEl.innerHTML = html;
    mapEl.style.height = 'auto';
    if (listEl) listEl.style.display = 'none';
    return;
  }
  // For larger result sets, restore chart height and show list
  mapEl.style.height = '400px';
  if (listEl) listEl.style.display = '';

  // Detect if filter has metro pills
  var hasMetroPills = false;
  if (configs && configs.length > 0) {
    configs.forEach(function(c) {
      if (c.sf && c.sf.wherePills) {
        c.sf.wherePills.forEach(function(p) {
          if (p.locType === 'metro' || p.locType === 'city') hasMetroPills = true;
        });
      }
    });
  }

  // Title
  if (titleEl) titleEl.textContent = hasMetroPills ? 'Where Are the Jobs (Cities)' : 'Where Are the Jobs';

  // Map via ECharts (simple US bar chart by state for now — SVG map would need registered map)
  var chart = statsCharts['#chart-geo-map'];
  if (!chart) { chart = echarts.init(mapEl, null, {renderer:'canvas'}); statsCharts['#chart-geo-map'] = chart; }
  
  var top15 = stateEntries.slice(0,15).reverse();
  chart.setOption({
    graphic:[],
    tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'},
      formatter:function(p){return '<b>'+p[0].name+'</b><br/>'+p[0].value+' jobs';}}, ttip()),
    grid: { top:10, right:30, bottom:10, left:40 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:top15.map(function(e){return e[0];}),
      axisLabel:{ color:_T.dim, fontFamily:_T.mono, fontSize:11 }, axisLine:{show:false}, axisTick:{show:false} },
    series: [{ type:'bar', data:top15.map(function(e,i){return {value:e[1],
      itemStyle:{color:new echarts.graphic.LinearGradient(0,0,1,0,[{offset:0,color:'rgba(59,130,246,0.2)'},{offset:1,color:'#3b82f6'}]), borderRadius:[0,3,3,0]}};}),
      barMaxWidth:18, label:{ show:true, position:'right', color:_T.dim, fontFamily:_T.mono, fontSize:10,
        formatter:function(p){return p.value.toLocaleString();}} }],
    animation:true, animationDuration:600,
  }, true);

  // List: top 10 metros or cities
  if (!listEl) return;
  var listData;
  if (hasMetroPills) {
    // Show cities within the metro filter areas
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top Cities in Filter</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  } else {
    // Show top metro areas (city, state combos)
    listData = Object.entries(cityCounts).filter(function(e){
        var st=e[0].split(', ').pop();
        return /^[A-Z]{2}$/.test(st) && 'AL,AK,AZ,AR,CA,CO,CT,DC,DE,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.indexOf(st)>=0;
      }).sort(function(a,b){return b[1]-a[1];}).slice(0,10);
    listEl.innerHTML = '<div style="font-weight:600;margin-bottom:8px;color:'+_T.dark+'">Top 10 Metro Areas</div>' +
      listData.map(function(e,i){return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid '+_T.border+'"><span>'+(i+1)+'. '+e[0]+'</span><span style="font-weight:600">'+e[1].toLocaleString()+'</span></div>';}).join('');
  }
}

// ─── Compare Mode Renderers (v6.09) ───
function renderCompareStatCards(cmp) {
  var a = cmp.a.stats, b = cmp.b.stats;
  setText('#sc-total', a.total.toLocaleString() + ' vs ' + b.total.toLocaleString());
  var salA = a.medianSalary ? '$' + Math.round(a.medianSalary/1000) + 'K' : '\u2014';
  var salB = b.medianSalary ? '$' + Math.round(b.medianSalary/1000) + 'K' : '\u2014';
  setText('#sc-salary', salA + ' vs ' + salB);
  setText('#sc-senior', a.seniorPct + '% vs ' + b.seniorPct + '%');
  setText('#sc-remote', a.remotePct + '% vs ' + b.remotePct + '%');
  setText('#sc-companies', a.companyCount.toLocaleString() + ' vs ' + b.companyCount.toLocaleString());
}

function renderCompareTimeline(cmp) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var keysA = Object.keys(cmp.a.stats.timelineBuckets).sort();
  var keysB = Object.keys(cmp.b.stats.timelineBuckets).sort();
  var allKeys = Array.from(new Set(keysA.concat(keysB))).sort();
  var labels = allKeys.map(function(k) { var d = new Date(k + 'T00:00:00Z'); return (d.getUTCMonth()+1) + '/' + d.getUTCDate(); });
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:24, left:50 },
    xAxis: { type:'category', data:labels, axisLabel:STATS_THEME.axisLabel },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [
      { name:cmp.a.name, type:'bar', data:allKeys.map(function(k){return cmp.a.stats.timelineBuckets[k]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:allKeys.map(function(k){return cmp.b.stats.timelineBuckets[k]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareSalary(cmp) {
  var chart = getOrCreateChart('#chart-salary'); if (!chart) return;
  var allBuckets = Object.assign({}, cmp.a.stats.salaryBuckets, cmp.b.stats.salaryBuckets);
  var labels = Object.keys(allBuckets).sort(function(a,b) {
    return parseInt(a.replace(/\D/g,'')) - parseInt(b.replace(/\D/g,''));
  });
  if (labels.length === 0) { emptyChart(chart, 'No salary data'); return; }
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:30, left:50 },
    xAxis: { type:'category', data:labels, axisLabel:Object.assign({},STATS_THEME.axisLabel,{rotate:45}) },
    yAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine, minInterval:1 },
    series: [
      { name:cmp.a.name, type:'bar', data:labels.map(function(l){return cmp.a.stats.salaryBuckets[l]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:labels.map(function(l){return cmp.b.stats.salaryBuckets[l]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareWorkType(cmp) {
  var chart = getOrCreateChart('#chart-location'); if (!chart) return;
  var cats = ['Remote','On-site','Hybrid','Unspecified'];
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis' }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:20, bottom:24, left:80 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:cats, axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11 } },
    series: [
      { name:cmp.a.name, type:'bar', data:cats.map(function(c){return cmp.a.stats.workTypeCounts[c]||0;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:cats.map(function(c){return cmp.b.stats.workTypeCounts[c]||0;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

function renderCompareTopCompanies(cmp) {
  var chart = getOrCreateChart('#chart-companies'); if (!chart) return;
  // Merge top companies from both
  var merged = {};
  cmp.a.stats.topCompanies.forEach(function(e) { if (!merged[e[0]]) merged[e[0]] = {a:0,b:0}; merged[e[0]].a = e[1]; });
  cmp.b.stats.topCompanies.forEach(function(e) { if (!merged[e[0]]) merged[e[0]] = {a:0,b:0}; merged[e[0]].b = e[1]; });
  var sorted = Object.entries(merged).sort(function(x,y){return (y[1].a+y[1].b)-(x[1].a+x[1].b);}).slice(0,10);
  if (sorted.length === 0) { emptyChart(chart, 'No industry data'); return; }
  var rev = sorted.slice().reverse();
  chart.setOption({
    graphic:[], tooltip: Object.assign({ trigger:'axis', axisPointer:{type:'shadow'} }, ttip()),
    legend: { data:[cmp.a.name, cmp.b.name], textStyle:{color:_T.dim,fontFamily:_T.sans,fontSize:11}, top:0 },
    grid: { top:30, right:30, bottom:10, left:120 },
    xAxis: { type:'value', axisLabel:STATS_THEME.axisLabel, splitLine:STATS_THEME.splitLine },
    yAxis: { type:'category', data:rev.map(function(e){return truncName(e[0],20);}),
      axisLabel:{ color:_T.dim, fontFamily:_T.sans, fontSize:11 } },
    series: [
      { name:cmp.a.name, type:'bar', data:rev.map(function(e){return e[1].a;}),
        itemStyle:{color:cmp.a.color}, barGap:'20%' },
      { name:cmp.b.name, type:'bar', data:rev.map(function(e){return e[1].b;}),
        itemStyle:{color:cmp.b.color} }
    ],
    animation:true, animationDuration:600,
  }, true);
}

// ─── Loading / Empty (no inline styles) ───
function showStatsLoading(on) {
  var grid = document.getElementById('stats-charts-grid');
  var empty = document.getElementById('stats-empty');
  if (empty) empty.style.display = 'none';
  if (on) {
    ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){ var e=document.querySelector(s); if(e) e.textContent='\u2014'; });
    if (grid) grid.classList.add('loading');
  } else { if (grid) grid.classList.remove('loading'); }
}
function showEmptyState(reason) {
  showStatsLoading(false);
  var msgs = { 'no-filters':'Create saved filters on the Jobs Feed page to see your personalized stats',
    'no-results':'No jobs match this filter. Try broadening your search criteria.',
    'error':'Something went wrong loading stats. Try refreshing the page.' };
  ['#sc-total','#sc-salary','#sc-senior','#sc-remote','#sc-companies'].forEach(function(s){setText(s,'\u2014');});
  var el = document.getElementById('stats-empty');
  if (el) { el.textContent = msgs[reason]||msgs['error']; el.style.display = ''; }
}

// ─── A15 Session 2: MV-backed aggregate queries ───

// Fetch source totals from mv_job_feed_counts (pre-aggregated, instant)
async function fetchSourceTotalsFromMV() {
  try {
    var cKey = 'mv:source-totals';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_job_feed_counts').select('ats_source,job_count,with_salary,refreshed_at');
    }, { ttl: 600000 }); // 10 min — matches MV refresh cycle
    if (result && result.data) {
      var totals = {};
      for (var i = 0; i < result.data.length; i++) {
        var row = result.data[i];
        var src = row.ats_source || 'unknown';
        if (!totals[src]) totals[src] = { jobs: 0, withSalary: 0 };
        totals[src].jobs += row.job_count;
        totals[src].withSalary += row.with_salary;
      }
      return totals;
    }
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV source totals failed:', e.message); }
  return null;
}

// Fetch weekly source breakdown from mv_source_breakdown (for timeline overlay)
async function fetchSourceBreakdownFromMV() {
  try {
    var cKey = 'mv:source-breakdown';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_source_breakdown').select('ats_source,week,jobs_added,companies,refreshed_at').order('week', { ascending: false });
    }, { ttl: 600000 }); // 10 min
    return (result && result.data) || null;
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV source breakdown failed:', e.message); }
  return null;
}

// A15 S5: Fetch landing stats from MV for stat cards (total_jobs, salary, remote, companies)
async function fetchLandingStatsFromMV() {
  try {
    var cKey = 'mv:landing-stats';
    var result = await cachedQuery(cKey, function() {
      return sb.from('mv_landing_stats').select('*').single();
    }, { ttl: 600000 }); // 10 min — matches MV refresh cycle
    return (result && result.data) || null;
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV landing stats failed:', e.message); }
  return null;
}

// A15 S5: Render stat cards from materialized view data (no row aggregation needed)
function renderStatCardsFromMV(mv) {
  var fmt = function(n) { return n != null ? Number(n).toLocaleString() : '\u2014'; };
  setText('#sc-total', fmt(mv.total_jobs));
  // Salary % = jobs_with_salary / total_jobs (MV has count, not median)
  var salaryPct = mv.total_jobs > 0 ? Math.round((mv.jobs_with_salary / mv.total_jobs) * 100) : 0;
  setText('#sc-salary', salaryPct + '%');
  // Update label to reflect the metric change
  var salaryLabel = document.querySelector('#sc-salary');
  if (salaryLabel && salaryLabel.nextElementSibling) salaryLabel.nextElementSibling.textContent = 'With Salary';
  // Remote %
  var remotePct = mv.total_jobs > 0 ? Math.round((mv.remote_jobs / mv.total_jobs) * 100) : 0;
  setText('#sc-remote', remotePct + '%');
  setText('#sc-companies', fmt(mv.total_companies));
  // Senior % not available from MV — show dash
  setText('#sc-senior', '\u2014');
}

// A15 S5: Show MV freshness badge
function renderMVFreshnessNotice(refreshedAt) {
  var el = document.getElementById('stats-mv-freshness');
  if (!el) {
    // Create badge dynamically if not in HTML
    var container = document.getElementById('stats-filter-pills');
    if (!container) return;
    el = document.createElement('span');
    el.id = 'stats-mv-freshness';
    el.style.cssText = 'font-size:11px;color:var(--text-faint);font-family:var(--mono);margin-left:auto;padding:3px 8px;border:1px solid var(--border);border-radius:6px;white-space:nowrap;display:flex;align-items:center;gap:4px;';
    container.appendChild(el);
  }
  if (refreshedAt) {
    var minsAgo = Math.round((Date.now() - new Date(refreshedAt).getTime()) / 60000);
    var fresh = minsAgo <= 15;
    var ageStr = minsAgo < 60 ? minsAgo + 'min ago' : Math.round(minsAgo / 60) + 'h ' + (minsAgo % 60) + 'min ago';
    el.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' + (fresh ? '#22c55e' : '#f59e0b') + ';display:inline-block"></span> Data ' + ageStr;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

function hideMVFreshnessNotice() {
  var el = document.getElementById('stats-mv-freshness');
  if (el) el.style.display = 'none';
}

// Check MV freshness — returns { fresh: bool, age: string, refreshed_at: string }
async function checkMVStaleness() {
  try {
    var result = await sb.from('mv_landing_stats').select('refreshed_at').single();
    if (result.error && result.error.code !== 'PGRST116') reportError('stats:mv-staleness', result.error);
    if (result && result.data) {
      var refreshedAt = new Date(result.data.refreshed_at);
      var ageMs = Date.now() - refreshedAt.getTime();
      var ageMins = Math.round(ageMs / 60000);
      var ageStr = ageMins < 60 ? ageMins + 'min ago' : Math.round(ageMins / 60) + 'h ' + (ageMins % 60) + 'min ago';
      return { fresh: ageMins <= 15, ageMs: ageMs, ageStr: ageStr, refreshedAt: result.data.refreshed_at };
    }
  } catch(e) { reportError('stats', e); console.warn('[Stats] MV staleness check failed:', e.message); }
  return { fresh: false, ageStr: 'unknown', refreshedAt: null };
}

// ─── A15 S3: Source-Colored Stacked Timeline from MV ───
function renderSourceTimelineFromMV(mvData) {
  var chart = getOrCreateChart('#chart-timeline'); if (!chart) return;
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6' };

  // Build { week: { source: count } } map
  var weekMap = {}, sources = {};
  for (var i = 0; i < mvData.length; i++) {
    var r = mvData[i];
    var wk = r.week; var src = r.ats_source || 'unknown';
    if (!weekMap[wk]) weekMap[wk] = {};
    weekMap[wk][src] = (weekMap[wk][src] || 0) + r.jobs_added;
    sources[src] = true;
  }

  // Sort weeks, take last 13
  var weeks = Object.keys(weekMap).sort();
  if (weeks.length > 13) weeks = weeks.slice(weeks.length - 13);
  var sourceList = Object.keys(sources).sort();

  // Build stacked bar series
  var series = sourceList.map(function(src) {
    return {
      name: src.charAt(0).toUpperCase() + src.slice(1),
      type: 'bar', stack: 'total', barMaxWidth: 28,
      data: weeks.map(function(wk) { return weekMap[wk][src] || 0; }),
      itemStyle: { color: sourceColors[src] || '#475569', borderRadius: sourceList.indexOf(src) === sourceList.length - 1 ? [3,3,0,0] : [0,0,0,0] },
      emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.15)' } }
    };
  });

  // WTD detection: last week might be current incomplete week
  var now = new Date();
  var todayDay = now.getUTCDay();
  var thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (todayDay === 0 ? 6 : todayDay - 1)));
  var wtdKey = thisMonday.toISOString().slice(0, 10);
  var hasWtd = todayDay !== 0 && weeks.indexOf(wtdKey) !== -1;

  chart.setOption({
    tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: function(params) {
        var d = new Date(params[0].name);
        var isWtd = hasWtd && params[0].name === wtdKey;
        var header = '<b>' + (isWtd ? 'WTD: ' : 'Week of ') + d.toLocaleDateString('en-US', {month:'short',day:'numeric'}) + '</b>' + (isWtd ? ' (so far)' : '');
        var total = 0;
        var lines = params.filter(function(p){return p.value > 0;}).map(function(p) {
          total += p.value;
          return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + p.color + ';margin-right:4px;"></span>' + p.seriesName + ': ' + p.value.toLocaleString();
        });
        return header + '<br/>' + lines.join('<br/>') + '<br/><b>Total: ' + total.toLocaleString() + '</b>';
      }
    }, ttip()),
    legend: { top: 0, textStyle: { fontFamily: _T.sans, fontSize: 11, color: _T.dim } },
    grid: { top: 35, right: 20, bottom: 30, left: 50 },
    xAxis: { type: 'category', data: weeks,
      axisLabel: { color: _T.dim, fontFamily: _T.mono, fontSize: 10, interval: 0,
        formatter: function(v) { var d = new Date(v); var label = d.toLocaleDateString('en-US', {month:'short',day:'numeric'}); return hasWtd && v === wtdKey ? label + '\n(WTD)' : label; } },
      axisLine: STATS_THEME.axisLine },
    yAxis: { type: 'value', axisLabel: STATS_THEME.axisLabel, splitLine: STATS_THEME.splitLine, minInterval: 1 },
    series: series,
    animation: true, animationDuration: 600
  }, true);
}

// ─── A15 S3: Source Breakdown Donut from MV Totals ───
function renderSourceBreakdownFromMV(mvTotals) {
  var chart = getOrCreateChart('#chart-source'); if (!chart) return;
  var sourceColors = { 'greenhouse':'#22c55e', 'lever':'#6366f1', 'ashby':'#f59e0b', 'workable':'#ec4899', 'recruitee':'#06b6d4', 'usajobs':'#3b82f6', 'unknown':'#475569' };

  var entries = Object.entries(mvTotals).sort(function(a,b) { return b[1].jobs - a[1].jobs; });
  if (entries.length === 0) { emptyChart(chart, 'No source data'); return; }

  var total = entries.reduce(function(a, e) { return a + e[1].jobs; }, 0);
  chart.setOption({
    graphic: [],
    tooltip: Object.assign({ trigger: 'item',
      formatter: function(p) {
        var src = p.name.toLowerCase();
        var entry = mvTotals[src];
        var salaryPct = entry && entry.withSalary > 0 ? Math.round((entry.withSalary / entry.jobs) * 100) : 0;
        return '<b>' + p.name + '</b><br/>' + p.value.toLocaleString() + ' jobs (' + ((p.value / total) * 100).toFixed(1) + '%)' +
          (salaryPct > 0 ? '<br/>' + salaryPct + '% with salary data' : '');
      }
    }, ttip()),
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['50%', '55%'],
      data: entries.map(function(e, i) {
        var name = e[0].charAt(0).toUpperCase() + e[0].slice(1);
        return { name: name, value: e[1].jobs, itemStyle: { color: sourceColors[e[0]] || STATS_COLORS[i % STATS_COLORS.length] } };
      }),
      label: { fontSize: 11, fontFamily: _T.sans, color: _T.dim,
        formatter: function(p) { return p.name + ' ' + ((p.value / total) * 100).toFixed(0) + '%'; } },
      emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      animationType: 'scale', animationDuration: 600
    }]
  }, true);
}

// ─── Resize / Refresh ───
function statsResizeAll() { Object.values(statsCharts).forEach(function(c){ if(c&&!c.isDisposed()) c.resize(); }); }
function refreshStatsCharts() {
  renderFilterPills();
  var stale = Object.values(statsCache).some(function(c){return Date.now()-c.timestamp>=STATS_CACHE_TTL;});
  if (stale || Object.keys(statsCache).length === 0) fetchAndRenderStats();
  else statsResizeAll();
}


// === js/billing.js ===
// js/billing.js — Subscription page, credit balance, pricing, checkout flows
// v3.72: Full subscription tab + credit merchandising
// QA-FIX: Uses SUPABASE_URL from globals.ts (shell chunk) instead of local var

// ─── State ───
var _creditBalance = 0;
var _userPricing = null;
var _userSubscription = null;
var _creditHistory = [];
var _isAdmin = false;

// ─── Credit Balance + Pricing Loaders ───
async function loadCreditBalance() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
    if (!error && data !== null) {
      _creditBalance = data;
      renderCreditBadge(data);
      renderSubscriptionBalance(data);
      checkLowCreditAlert(data);
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Failed to load credit balance:', e.message); toastWarning('Unable to load credit balance');
  }
}

async function loadUserPricing() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.rpc('get_effective_pricing', { p_user_id: currentUser.id });
    if (!error && data) {
      _userPricing = data;
      renderPlanBadge(data);
      renderSubscriptionPlan(data);
      renderTierComparison(data);
      renderCreditPacks(data);
      renderUpgradeBanner(data);
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Failed to load pricing:', e.message); toastWarning('Unable to load pricing');
  }
}

async function loadUserSubscription() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
    if (!error && data) {
      _userSubscription = data;
      renderSubscriptionPeriod(data);
    }
  } catch(e) { reportError('billing:billing', e); }
}

async function loadCreditHistory() {
  if (!currentUser?.id) return;
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await sb
      .from('credit_ledger')
      .select('amount,type,cost_category,description,created_at')
      .eq('user_id', currentUser.id)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });
    if (!error && data) {
      _creditHistory = data;
      renderUsageBreakdown(data);
      renderBurnRate(data);
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Failed to load credit history:', e.message); toastWarning('Unable to load credit history');
  }
}

// ─── Nav Badge ───
function renderCreditBadge(balance) {
  const el = document.getElementById('credit-balance-badge');
  if (!el) return;
  if (_isAdmin) {
    el.textContent = '∞';
    el.className = 'credit-balance-count credit-green';
    return;
  }
  el.textContent = balance.toLocaleString();
  el.className = 'credit-balance-count';
  if (balance > 50) el.classList.add('credit-green');
  else if (balance >= 10) el.classList.add('credit-amber');
  else el.classList.add('credit-red');
}

function renderPlanBadge(pricing) {
  const el = document.querySelector('.nav-user-plan');
  if (!el) return;
  if (_isAdmin) {
    el.textContent = 'ADMIN';
    el.style.color = '#f59e0b';
    el.style.fontWeight = '700';
    el.style.letterSpacing = '1px';
    return;
  }
  const tierNames = { free: 'Free Plan', starter: 'Starter Plan', pro: 'Pro Plan' };
  el.textContent = tierNames[pricing.tier] || 'Free Plan';
  el.style.color = '';
  el.style.fontWeight = '';
  el.style.letterSpacing = '';
}

// ─── Subscription Page Renderers ───
function renderSubscriptionPlan(pricing) {
  const tierNames = { free: 'Free', starter: 'Starter', pro: 'Pro' };
  const el = (id) => document.getElementById(id);
  if (_isAdmin) {
    if (el('sub-plan-name')) el('sub-plan-name').textContent = 'Admin';
    if (el('sub-plan-price')) el('sub-plan-price').textContent = 'Unlimited';
    if (el('sub-plan-credits-included')) el('sub-plan-credits-included').textContent = 'Unlimited credits';
    if (el('sub-plan-payg')) el('sub-plan-payg').textContent = 'All features unlocked';
    return;
  }
  if (el('sub-plan-name')) el('sub-plan-name').textContent = tierNames[pricing.tier] || 'Free';
  if (el('sub-plan-price')) el('sub-plan-price').textContent = pricing.subscription_price_cents === 0 ? '$0/mo' : '$' + (pricing.subscription_price_cents / 100).toFixed(0) + '/mo';
  if (el('sub-plan-credits-included')) el('sub-plan-credits-included').textContent = pricing.included_credits + ' credits included/month';
  if (el('sub-plan-payg')) el('sub-plan-payg').textContent = 'PAYG rate: $' + (pricing.payg_rate_cents / 100).toFixed(2) + '/credit';
}

function renderSubscriptionPeriod(sub) {
  if (!sub?.current_period_end) return;
  const periodEl = document.getElementById('sub-plan-period');
  const dateEl = document.getElementById('sub-plan-renew-date');
  if (periodEl && dateEl) {
    const date = new Date(sub.current_period_end);
    dateEl.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    periodEl.style.display = '';
  }
}

function renderSubscriptionBalance(balance) {
  const el = document.getElementById('sub-balance-number');
  if (el) {
    if (_isAdmin) {
      el.textContent = '∞';
      el.className = 'sub-balance-number credit-green';
      return;
    }
    el.textContent = balance.toLocaleString();
    el.className = 'sub-balance-number';
    if (balance > 50) el.classList.add('credit-green');
    else if (balance >= 10) el.classList.add('credit-amber');
    else el.classList.add('credit-red');
  }
}

function renderBurnRate(history) {
  const debits = history.filter(h => h.amount < 0);
  if (debits.length === 0) return;
  const totalUsed = debits.reduce((sum, h) => sum + Math.abs(h.amount), 0);
  const firstDebit = new Date(debits[debits.length - 1].created_at);
  const daySpan = Math.max(1, (Date.now() - firstDebit.getTime()) / 86400000);
  const dailyBurn = totalUsed / daySpan;
  const daysLeft = dailyBurn > 0 ? Math.floor(_creditBalance / dailyBurn) : Infinity;

  const burnEl = document.getElementById('sub-burn-rate');
  const dailyEl = document.getElementById('sub-daily-burn');
  const daysEl = document.getElementById('sub-days-left');
  if (burnEl && dailyEl && daysEl) {
    dailyEl.textContent = dailyBurn.toFixed(1);
    daysEl.textContent = daysLeft === Infinity ? '∞' : daysLeft.toString();
    burnEl.style.display = '';
  }
}

function renderUsageBreakdown(history) {
  const debits = history.filter(h => h.amount < 0);
  let scoring = 0, rewrites = 0, alerts = 0;
  debits.forEach(d => {
    const desc = (d.description || '').toLowerCase();
    const amt = Math.abs(d.amount);
    if (desc.includes('score') || desc.includes('scoring')) scoring += amt;
    else if (desc.includes('rewrite')) rewrites += amt;
    else if (desc.includes('alert')) alerts += amt;
  });
  const el = (id) => document.getElementById(id);
  if (el('sub-usage-scoring')) el('sub-usage-scoring').textContent = scoring + ' credits';
  if (el('sub-usage-rewrites')) el('sub-usage-rewrites').textContent = rewrites + ' credits';
  if (el('sub-usage-alerts')) el('sub-usage-alerts').textContent = alerts + ' credits';
}

// ─── Low Credit Alert ───
function checkLowCreditAlert(balance) {
  const alertEl = document.getElementById('sub-credit-alert');
  const countEl = document.getElementById('sub-alert-count');
  if (!alertEl) return;
  if (_isAdmin) { alertEl.style.display = 'none'; return; }
  if (balance === 0) {
    if (countEl) countEl.textContent = '0';
    const msgEl = document.getElementById('sub-alert-msg');
    if (msgEl) msgEl.innerHTML = "You're out of credits. <strong>Buy more to continue using AI features.</strong>";
    alertEl.style.display = 'flex';
    alertEl.classList.add('sub-alert-critical');
  } else if (balance <= 10) {
    if (countEl) countEl.textContent = balance;
    alertEl.style.display = 'flex';
    alertEl.classList.remove('sub-alert-critical');
  } else {
    alertEl.style.display = 'none';
  }
}

// ─── Tier Comparison ───
function renderTierComparison(pricing) {
  const container = document.getElementById('sub-tiers');
  if (!container) return;
  const currentTier = pricing.tier;
  const tiers = [
    { id: 'free', name: 'Free', price: 0, credits: 0, payg: 25, features: ['1 saved filter', '1 resume', 'Basic job feed'] },
    { id: 'starter', name: 'Starter', price: 2000, credits: 100, payg: 15, features: ['10 saved filters', '5 resumes', 'AI resume scoring', 'SMS notifications', 'Boolean search'] },
    { id: 'pro', name: 'Pro', price: 4000, credits: 300, payg: 10, features: ['10 saved filters', '5 resumes', 'AI resume scoring', 'AI resume rewrites', 'SMS notifications', 'Boolean search', 'Auto-apply', 'Network intelligence'] },
  ];
  // FB-PAYL-S2: Insert PAYL card between Free and Starter for non-Pro users
  var paylCard = '';
  if (typeof window.renderPaylTierCard === 'function' && currentTier !== 'pro') {
    paylCard = window.renderPaylTierCard(currentTier);
  }
  container.innerHTML = tiers.map((t, idx) => {
    const isCurrent = t.id === currentTier;
    const priceStr = t.price === 0 ? '$0' : '$' + (t.price / 100);
    var card = `
      <div class="sub-tier-card ${isCurrent ? 'sub-tier-current' : ''}" style="display:flex;flex-direction:column;">
        ${isCurrent ? '<div class="sub-tier-badge">Current</div>' : ''}
        <div class="sub-tier-name">${t.name}</div>
        <div class="sub-tier-price">${priceStr}<span class="sub-tier-interval">/mo</span></div>
        <div class="sub-tier-credits">${t.credits > 0 ? t.credits + ' credits/mo' : 'No included credits'}</div>
        <div class="sub-tier-payg">$${(t.payg / 100).toFixed(2)}/credit PAYG</div>
        <ul class="sub-tier-features" style="flex:1;">${t.features.map(f => '<li>' + f + '</li>').join('')}</ul>
        <div style="margin-top:auto;text-align:center;">
        ${isCurrent
          ? '<button class="btn-secondary btn-sm" disabled>Current Plan</button>'
          : t.id === 'free'
            ? ''
            : `<button class="btn-primary btn-sm" onclick="startCheckout('subscription','${t.id}')">${currentTier === 'free' || t.price > (pricing.subscription_price_cents || 0) ? 'Upgrade' : 'Switch'}</button>`
        }
        </div>
      </div>`;
    // Insert PAYL card after Free tier
    if (idx === 0 && paylCard) card += paylCard;
    return card;
  }).join('');
}

// ─── Credit Packs ───
function renderCreditPacks(pricing) {
  const container = document.getElementById('sub-packs');
  if (!container) return;
  const rate = pricing.payg_rate_cents;
  container.innerHTML = [10, 50, 100].map(qty => {
    const total = (qty * rate / 100).toFixed(2);
    return `
      <div class="sub-pack-card" onclick="startCheckout('credit_pack', null, ${qty})">
        <div class="sub-pack-qty">${qty}</div>
        <div class="sub-pack-label">credits</div>
        <div class="sub-pack-price">$${total}</div>
        <div class="sub-pack-rate">$${(rate / 100).toFixed(2)}/credit</div>
      </div>`;
  }).join('');
}

// ─── Upgrade Banner ───
function renderUpgradeBanner(pricing) {
  const banner = document.getElementById('sub-upgrade-banner');
  if (!banner) return;
  if (_isAdmin || pricing.tier === 'pro') { banner.style.display = 'none'; return; }
  const headline = document.getElementById('sub-upgrade-headline');
  const detail = document.getElementById('sub-upgrade-detail');
  const btn = banner.querySelector('button');
  if (pricing.tier === 'free') {
    if (headline) headline.textContent = 'Get started with Starter';
    if (detail) detail.textContent = '100 credits/month, $0.15/credit PAYG, AI resume scoring, SMS alerts — $20/mo';
    if (btn) { btn.textContent = 'Upgrade to Starter'; btn.setAttribute('onclick', "startCheckout('subscription','starter')"); }
  } else {
    if (headline) headline.textContent = 'Unlock everything with Pro';
    if (detail) detail.textContent = '300 credits/month, $0.10/credit PAYG, AI rewrites, auto-apply, network intelligence — $40/mo';
  }
  banner.style.display = 'flex';
}

// ─── Pricing Modal (nav badge click → navigate to subscription tab) ───
function openPricingModal() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === 'subscription'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const subPage = document.getElementById('page-subscription');
  if (subPage) subPage.classList.add('active');
  localStorage.setItem('bj_active_tab', 'subscription');
}

// ─── Checkout Flow ───
async function startCheckout(mode, tier, packQty) {
  // CX-06: PostHog — checkout started
  if (window.posthog) posthog.capture('billing_checkout_started', { mode, tier: tier || null, pack_qty: packQty || null });
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  const body = { mode };
  if (mode === 'subscription') body.tier = tier;
  if (mode === 'credit_pack') body.pack_qty = packQty;
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; }
    else { showToast('Failed to start checkout. Please try again.', 'error'); }
  } catch (e) { showToast('Network error. Please try again.', 'error'); }
}

async function openCustomerPortal() {
  // CX-06: PostHog — billing portal opened
  if (window.posthog) posthog.capture('billing_portal_opened');
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/manage-subscription', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.url) { window.open(data.url, '_blank'); }
    else { showToast('Unable to open billing portal. You may need to subscribe first.', 'warning'); }
  } catch (e) { showToast('Network error. Please try again.', 'error'); }
}

// ─── Credit Gate (call before credit-consuming actions) ───
async function requireCredits(amount, description) {
  if (_isAdmin) return true;
  if (_creditBalance >= amount) return true;
  showToast('You need ' + amount + ' credits for ' + description + '. You have ' + _creditBalance + '.', 'warning');
  // P13-09: Paywall friction micro-survey
  if (typeof showPaywallFriction === 'function') showPaywallFriction(description);
  openPricingModal();
  return false;
}

// ─── Debit Credits (call to actually debit after action) ───
async function debitCreditsForAction(amount, costCategory, description, costCents) {
  if (!currentUser?.id) return null;
  try {
    var result = await sb.rpc('debit_credits', {
      p_user_id: currentUser.id,
      p_amount: amount,
      p_cost_category: costCategory || 'claude',
      p_description: description || 'AI action',
      p_cost_cents: costCents || 0
    });
    if (result.error) {
      reportError('billing:debit-credits', result.error); toastError('Credit deduction failed');
      return { success: false, error: result.error.message };
    }
    var data = result.data;
    if (data.success) {
      // Update local balance
      if (data.admin) {
        _creditBalance = 999999;
      } else {
        _creditBalance = data.balance;
      }
      renderCreditBadge(_creditBalance);
      renderSubscriptionBalance(_creditBalance);
      // Check if auto-refill should fire
      if (data.trigger_refill) {
        triggerAutoRefill();
      }
    }
    return data;
  } catch (e) {
    reportError('billing', e);
    console.error('[Billing] debitCreditsForAction error:', e); toastError('Credit deduction failed');
    return { success: false, error: e.message };
  }
}

// ─── Auto-Refill Trigger ───
async function triggerAutoRefill() {
  if (!currentUser?.id) return;
  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;
    console.log('[Billing] Triggering auto-refill');
    var res = await fetch(SUPABASE_URL + '/functions/v1/auto-refill', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id }),
    });
    var data = await res.json();
    if (data.refilled) {
      showToast('Auto-refill: $' + (data.amount_cents / 100).toFixed(2) + ' charged. Credits incoming!', 'success');
      // Credits will be granted by Stripe webhook — refresh balance after delay
      setTimeout(function() { loadCreditBalance(); }, 5000);
    } else if (data.reason === 'payment_failed') {
      showToast('Auto-refill failed: ' + (data.error || 'payment declined') + '. Check your payment method.', 'error');
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Auto-refill trigger error:', e); toastWarning('Auto-refill check failed');
  }
}

// ─── Payment Return Detection ───
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    showToast('Payment successful! Your credits will update shortly.', 'success');
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(function() { loadCreditBalance(); loadUserPricing(); loadUserSubscription(); }, 2000);
  } else if (params.get('payment') === 'canceled') {
    showToast('Payment canceled.', 'info');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ─── Auto-Refill Toggle ───
function initAutoRefillUI() {
  const toggle = document.getElementById('sub-refill-enabled');
  const levels = document.getElementById('sub-refill-levels');
  if (!toggle || !levels) return;
  toggle.addEventListener('change', function() {
    levels.style.display = toggle.checked ? '' : 'none';
    if (!toggle.checked && currentUser?.id) {
      sb.from('auto_refill_settings').upsert({
        user_id: currentUser.id, enabled: false, refill_level: 'low', threshold_credits: 0
      }, { onConflict: 'user_id' });
    }
  });
  if (currentUser?.id) {
    sb.from('auto_refill_settings').select('*').eq('user_id', currentUser.id).single()
      .then(function(resp) {
        if (resp.data) {
          toggle.checked = resp.data.enabled;
          levels.style.display = resp.data.enabled ? '' : 'none';
          var radio = document.getElementById('refill-' + resp.data.refill_level);
          if (radio) radio.checked = true;
        }
      });
  }
  document.querySelectorAll('input[name="refill-level"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (!currentUser?.id) return;
      sb.from('auto_refill_settings').upsert({
        user_id: currentUser.id, enabled: true, refill_level: radio.value, threshold_credits: 0
      }, { onConflict: 'user_id' });
      showToast('Auto-refill updated.', 'success');
    });
  });
}

// ─── Hire Fee: SetupIntent Flow ───
async function setupHireFee() {
  var session = await sb.auth.getSession();
  var token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }

  try {
    showToast('Setting up payment authorization...', 'info');
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup' }),
    });
    var data = await res.json();
    if (data.client_secret) {
      // Load Stripe.js and mount card element for SetupIntent confirmation
      if (!window.Stripe) {
        var script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = function() { confirmSetupIntent(data.client_secret); };
        document.head.appendChild(script);
      } else {
        confirmSetupIntent(data.client_secret);
      }
    } else {
      showToast('Failed to set up payment: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Network error. Please try again.', 'error');
  }
}

async function confirmSetupIntent(clientSecret) {
  var stripe = Stripe('pk_live_51T3TKnPKzCZbw3KzvE3xlxz8Yt9Hx9PTIRewh21Pks8YQt6TgV5urss7w93Hd27vfnZQlMiAvMP9WAgRSHM3dFFz00ufrYmhyI');

  // Create a modal with card element
  var modal = document.createElement('div');
  modal.id = 'hire-fee-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.2);">' +
    '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">Authorize Payment Method</h3>' +
    '<p style="font-size:12px;color:var(--text-dim);margin-bottom:20px;">This card will only be charged when you confirm a successful hire through Brilliant Jobs.</p>' +
    '<div id="hire-fee-card-element" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:16px;"></div>' +
    '<div id="hire-fee-error" style="color:hsl(0,70%,50%);font-size:12px;margin-bottom:12px;display:none;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'hire-fee-modal\').remove()" class="btn-secondary btn-sm">Cancel</button>' +
    '<button id="hire-fee-confirm-btn" class="btn-primary btn-sm">Authorize</button>' +
    '</div></div>';
  document.body.appendChild(modal);

  var elements = stripe.elements();
  var cardElement = elements.create('card', {
    style: {
      base: { fontSize: '14px', color: '#1a1a2e', '::placeholder': { color: '#999' } }
    }
  });
  cardElement.mount('#hire-fee-card-element');

  document.getElementById('hire-fee-confirm-btn')?.addEventListener('click', async function() {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Authorizing...';
    var errorEl = document.getElementById('hire-fee-error');

    var result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement }
    });

    if (result.error) {
      errorEl.textContent = result.error.message;
      errorEl.style.display = '';
      btn.disabled = false;
      btn.textContent = 'Authorize';
    } else {
      // SetupIntent succeeded — stripe-webhook will store the payment method
      showToast('Payment method authorized! You\'re all set for pay-when-hired.', 'success');
      modal.remove();
      // Refresh hire fee status after webhook processes
      setTimeout(function() { loadHireFeeStatus(); }, 2000);
    }
  });

  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

async function loadHireFeeStatus() {
  if (!currentUser?.id) return;
  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    if (!res.ok) return; // Edge function not deployed yet — silent fail
    var data = await res.json();
    var noMethodEl = document.getElementById('sub-hire-fee-nomethod');
    var activeEl = document.getElementById('sub-hire-fee-active');
    if (noMethodEl && activeEl) {
      noMethodEl.style.display = data.has_payment_method ? 'none' : '';
      activeEl.style.display = data.has_payment_method ? '' : 'none';
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Failed to load hire fee status:', e); toastWarning('Unable to load hire fee status');
  }
}

// Called from pipeline when user marks a job as "hired"
async function confirmHireFee(jobId, jobTitle, salaryEstimate) {
  var feeAmountCents = Math.min(500000, Math.max(50000, Math.round((salaryEstimate || 80000) * 0.05 * 100)));
  var feeDisplay = '$' + (feeAmountCents / 100).toLocaleString();

  if (!confirm('Congratulations on your new role!\n\n' +
    'Job: ' + (jobTitle || 'Unknown') + '\n' +
    'Success fee: ' + feeDisplay + '\n\n' +
    'By confirming, your authorized payment method will be charged ' + feeDisplay + '.')) {
    return false;
  }

  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return false;

    showToast('Processing hire fee...', 'info');
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'charge', amount_cents: feeAmountCents, job_id: jobId }),
    });
    var data = await res.json();
    if (data.charged) {
      showToast('Hire fee of ' + feeDisplay + ' charged. Thank you and congratulations!', 'success');
      return true;
    } else if (data.error === 'no_payment_method') {
      showToast('No payment method on file. Please authorize a card in your Subscription settings.', 'warning');
      openPricingModal();
      return false;
    } else {
      showToast('Payment failed: ' + (data.error || 'Unknown error'), 'error');
      return false;
    }
  } catch (e) {
    showToast('Network error processing hire fee.', 'error');
    return false;
  }
}

// v5.17: Expose credit balance for resume score UX tier-routing
function getUserCredits() { return _creditBalance; }
window.getUserCredits = getUserCredits;

// ─── Init ───
function initBilling() {
  // CX-06: PostHog — billing page viewed
  if (window.posthog) posthog.capture('billing_page_viewed');
  // Check admin status from profile (already fetched in app.js init)
  _isAdmin = (window._bjUserRole === 'admin');
  loadCreditBalance();
  loadUserPricing();
  loadUserSubscription();
  loadCreditHistory();
  checkPaymentReturn();
  initAutoRefillUI();
  loadHireFeeStatus();
  _initTierChangeListener();
}

// ═══════════════════════════════════════════════════════════
// Item #11: Tier Change Push Notification
// Listens for realtime changes to user_subscriptions and
// fires a toast when plan changes mid-session.
// ═══════════════════════════════════════════════════════════
var _tierChangeChannel = null;

function _initTierChangeListener() {
  if (!currentUser?.id || _tierChangeChannel) return;
  try {
    _tierChangeChannel = sb.channel('tier-change-' + currentUser.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_subscriptions',
        filter: 'user_id=eq.' + currentUser.id
      }, function(payload) {
        var newTier = payload.new?.tier;
        var oldTier = payload.old?.tier;
        if (newTier && oldTier && newTier !== oldTier) {
          var tierNames = { free: 'Free', starter: 'Starter', pro: 'Pro' };
          var isUpgrade = (newTier === 'pro') || (newTier === 'starter' && oldTier === 'free');
          if (typeof showToast === 'function') {
            showToast(
              (isUpgrade ? '' : '') + 'Plan changed: ' + (tierNames[oldTier] || oldTier) + ' → ' + (tierNames[newTier] || newTier),
              { type: isUpgrade ? 'success' : 'info', duration: 8000 }
            );
          }
          // Reload pricing and credit balance to reflect new tier
          loadUserPricing();
          loadCreditBalance();
          loadUserSubscription();
        }
      })
      .subscribe();
  } catch(e) { reportError('billing', e); console.warn('[billing] Tier change listener setup failed:', e);
  }
}

// CS-P1-004 FE-005: Register billing exports with BJ namespace
(function() {
  ['getUserCredits'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'billing', registered: Date.now() };
    }
  });
})();


// === js/micro-surveys.js ===
// js/micro-surveys.js — P13-04/05/06/09 Inline micro-survey components
// Lightweight survey prompts that appear inline in the dashboard.
// All responses stored in feedback table via Supabase REST API.
//
// v4.12 — S3-1: Priority-weighted micro-survey selection
//   Instead of first-trigger-wins, eligible surveys queue up and the
//   highest-priority one is shown. Paywall friction (willingness-to-pay
//   signal) gets highest priority since it feeds monetization decisions.
//
// Usage:
//   showPaywallFriction('resume_grading')  — after feature limit hit
//   showSearchRelevance(filterName, count)  — after 10th search or 5min session
//   showApplyConfidence(jobId, company)     — after pipeline apply action
//   showDataValue(featureContext)            — after 10s viewing stats/data
//
// Rate limiting: max 1 micro-survey per session, stored in sessionStorage.

(function() {
  'use strict';

  var MICRO_SURVEY_KEY = 'bj_micro_survey_shown';

  // ─── Priority Queue ───
  // Higher number = higher priority. Paywall is king (monetization signal).
  var PRIORITY = {
    micro_paywall_v1: 100,
    micro_search_v1: 60,
    micro_apply_v1: 50,
    micro_data_v1: 30
  };

  // Pending surveys that haven't been shown yet, waiting for the flush window
  var _pendingQueue = [];
  var _flushTimer = null;
  var FLUSH_DELAY_MS = 500; // Wait 500ms to collect competing triggers before picking winner

  // ─── Rate Limiter ───
  function canShowMicroSurvey() {
    try {
      return !sessionStorage.getItem(MICRO_SURVEY_KEY);
    } catch { return true; }
  }

  function markMicroSurveyShown() {
    try {
      sessionStorage.setItem(MICRO_SURVEY_KEY, Date.now().toString());
    } catch { /* ignore */ }
  }

  // ─── Queue + Flush Logic ───
  // When a trigger fires, it enqueues a survey config. After FLUSH_DELAY_MS,
  // the highest-priority pending survey is displayed and the rest are discarded.
  function enqueueMicroSurvey(config) {
    if (!canShowMicroSurvey()) return;
    _pendingQueue.push(config);

    // Reset the flush timer — give other triggers a chance to fire
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flushQueue, FLUSH_DELAY_MS);
  }

  function flushQueue() {
    _flushTimer = null;
    if (!canShowMicroSurvey() || _pendingQueue.length === 0) return;

    // Sort by priority descending, pick winner
    _pendingQueue.sort(function(a, b) {
      return (PRIORITY[b.version] || 0) - (PRIORITY[a.version] || 0);
    });

    var winner = _pendingQueue[0];
    var suppressed = _pendingQueue.slice(1);

    // Log what was suppressed for analytics
    if (suppressed.length > 0) {
      console.info('[micro-survey] Showing', winner.version,
        '(priority ' + (PRIORITY[winner.version] || 0) + '),',
        'suppressed:', suppressed.map(function(s) { return s.version; }).join(', '));
    }

    // Clear queue
    _pendingQueue = [];

    // Display the winner
    displayMicroSurvey(winner);
  }

  function displayMicroSurvey(config) {
    var card = createMicroCard(config);

    if (config.displayMode === 'toast') {
      card.classList.add('micro-survey-toast');
      document.body.appendChild(card);
    } else {
      var target = config.target
        || document.getElementById('main-content')
        || document.querySelector('.content-area')
        || document.querySelector('main')
        || document.body;
      target.insertBefore(card, target.firstChild);
    }
  }

  // ─── Submit to Supabase ───
  async function submitMicroSurvey(version, responses, context) {
    var SUPABASE_URL = window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co';
    var SUPABASE_ANON_KEY = window._bjAnonKey || '';

    var userId = null;
    var authHeader = 'Bearer ' + SUPABASE_ANON_KEY;
    try {
      var stored = localStorage.getItem('sb-qojhagupdnbtomfoxnsf-auth-token');
      if (stored) {
        var session = JSON.parse(stored);
        if (session?.access_token && session?.user?.id) {
          userId = session.user.id;
          authHeader = 'Bearer ' + session.access_token;
        }
      }
    } catch { /* anon fallback */ }

    var payload = {
      type: 'micro_survey',
      user_id: userId,
      survey_version: version,
      answers: responses,
      feature_context: context || null,
      created_at: new Date().toISOString()
    };

    try {
      await fetch(SUPABASE_URL + '/rest/v1/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      reportError('micro_surveys', e);
      console.warn('[micro-survey] Submit failed:', e);
    }
  }

  // ─── Generic Micro-Survey Card ───
  function createMicroCard(config) {
    var card = document.createElement('div');
    card.className = 'micro-survey-card';
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', 'Quick survey');

    var inner = '<div class="micro-survey-inner">';
    inner += '<button class="micro-survey-close" aria-label="Dismiss survey">&times;</button>';
    inner += '<div class="micro-survey-q">' + config.question + '</div>';

    if (config.type === 'choice') {
      inner += '<div class="micro-survey-opts">';
      config.options.forEach(function(opt, i) {
        inner += '<button class="micro-survey-opt" data-val="' + i + '">' + opt + '</button>';
      });
      inner += '</div>';
    } else if (config.type === 'rating') {
      inner += '<div class="micro-survey-rating">';
      for (var r = 1; r <= 5; r++) {
        inner += '<button class="micro-survey-star" data-val="' + r + '">' + r + '</button>';
      }
      inner += '</div>';
      if (config.minLabel || config.maxLabel) {
        inner += '<div class="micro-survey-labels"><span>' + (config.minLabel || '') + '</span><span>' + (config.maxLabel || '') + '</span></div>';
      }
    }

    if (config.followUp) {
      inner += '<div class="micro-survey-followup hidden">';
      inner += '<div class="micro-survey-q micro-survey-q2">' + config.followUp.question + '</div>';
      if (config.followUp.type === 'chips') {
        inner += '<div class="micro-survey-chips">';
        config.followUp.options.forEach(function(opt, i) {
          inner += '<button class="micro-survey-chip" data-val="' + i + '">' + opt + '</button>';
        });
        inner += '</div>';
      }
      inner += '</div>';
    }

    inner += '<div class="micro-survey-thanks hidden">Thanks for the feedback!</div>';
    inner += '</div>';
    card.innerHTML = inner;

    // ─── Wire Events ───
    var answers = {};
    var closed = false;

    card.querySelector('.micro-survey-close').addEventListener('click', function() {
      card.classList.add('micro-survey-out');
      closed = true;
      setTimeout(function() { card.remove(); }, 300);
    });

    // Primary answer (choice or rating)
    card.querySelectorAll('.micro-survey-opt, .micro-survey-star').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (closed) return;
        btn.parentElement.querySelectorAll('button').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');

        var val = parseInt(btn.dataset.val);
        if (config.type === 'choice') {
          answers.primary = { index: val, text: config.options[val] };
        } else {
          answers.primary = { rating: val };
        }

        // Show follow-up if configured
        var followup = card.querySelector('.micro-survey-followup');
        if (followup && config.followUp) {
          followup.classList.remove('hidden');
        } else {
          finishMicro();
        }
      });
    });

    // Follow-up chips (multi-select)
    card.querySelectorAll('.micro-survey-chip').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (closed) return;
        btn.classList.toggle('selected');
        var selected = [];
        card.querySelectorAll('.micro-survey-chip.selected').forEach(function(s) {
          selected.push(config.followUp.options[parseInt(s.dataset.val)]);
        });
        answers.followup = selected;

        // Auto-submit 1s after last chip click
        clearTimeout(card._chipTimer);
        card._chipTimer = setTimeout(function() { finishMicro(); }, 1000);
      });
    });

    function finishMicro() {
      submitMicroSurvey(config.version, answers, config.featureContext);
      card.querySelectorAll('.micro-survey-opts, .micro-survey-rating, .micro-survey-followup, .micro-survey-q, .micro-survey-q2, .micro-survey-labels').forEach(function(el) {
        el.classList.add('hidden');
      });
      card.querySelector('.micro-survey-thanks').classList.remove('hidden');
      setTimeout(function() {
        card.classList.add('micro-survey-out');
        setTimeout(function() { card.remove(); }, 300);
      }, 1500);
    }

    markMicroSurveyShown();
    return card;
  }

  // ─── P13-09: Paywall Friction Survey ───
  // Shows when a free user hits a feature limit
  // PRIORITY: 100 (highest — monetization signal)
  window.showPaywallFriction = function(featureName) {
    enqueueMicroSurvey({
      question: 'Would you pay to unlock this feature?',
      type: 'choice',
      options: ['Definitely', 'Maybe', 'No'],
      followUp: {
        question: 'What\'s holding you back?',
        type: 'chips',
        options: ['Too expensive', 'Not enough value yet', 'Just browsing', 'Already paying elsewhere']
      },
      version: 'micro_paywall_v1',
      featureContext: featureName,
      displayMode: 'inline',
      target: document.getElementById('main-content') || document.querySelector('.content-area') || document.querySelector('main') || document.body
    });
  };

  // ─── P13-04: Post-Search Relevance Survey ───
  // PRIORITY: 60
  window.showSearchRelevance = function(filterName, resultCount) {
    enqueueMicroSurvey({
      question: 'How relevant were these results?',
      type: 'rating',
      minLabel: 'Not at all',
      maxLabel: 'Very relevant',
      followUp: {
        question: 'What was missing?',
        type: 'chips',
        options: ['More salary data', 'Wrong seniority level', 'Too many ghost jobs', 'Not my industry', 'Other']
      },
      version: 'micro_search_v1',
      featureContext: JSON.stringify({ filter: filterName, result_count: resultCount }),
      displayMode: 'inline',
      // QA-FIX: Target the feed section specifically so survey doesn't appear between feed and tuning
      target: document.getElementById('job-table') || document.getElementById('page-jobs') || document.body
    });
  };

  // ─── P13-05: Post-Application Confidence Survey ───
  // PRIORITY: 50
  window.showApplyConfidence = function(jobId, companyName) {
    enqueueMicroSurvey({
      question: 'How confident are you this job is real?',
      type: 'rating',
      minLabel: 'Likely ghost',
      maxLabel: 'Definitely real',
      followUp: {
        question: 'Was the application process clear?',
        type: 'chips',
        options: ['Yes, very clear', 'Somewhat', 'No, confusing']
      },
      version: 'micro_apply_v1',
      featureContext: JSON.stringify({ job_id: jobId, company: companyName }),
      displayMode: 'toast'
    });
  };

  // ─── P13-06: Data Value Assessment ───
  // PRIORITY: 30 (lowest — passive viewing, least commercial signal)
  window.showDataValue = function(featureContext) {
    enqueueMicroSurvey({
      question: 'Did this data help your decision?',
      type: 'choice',
      options: ['Yes, very helpful', 'Somewhat', 'Not really'],
      version: 'micro_data_v1',
      featureContext: featureContext,
      displayMode: 'toast'
    });
  };

  // ─── Search/Session Tracking (P13-04) ───
  var _searchCount = 0;
  var _sessionStart = Date.now();

  window.trackSearchForSurvey = function(filterName, resultCount) {
    _searchCount++;
    var sessionMinutes = (Date.now() - _sessionStart) / 60000;
    // QA-FIX: Only show relevancy survey when Jobs Feed tab is active
    var jobsPage = document.getElementById('page-jobs');
    if (!jobsPage || !jobsPage.classList.contains('active')) return;
    if (_searchCount >= 10 || sessionMinutes >= 5) {
      showSearchRelevance(filterName, resultCount);
    }
  };

  // ─── Data Page Timer (P13-06) ───
  var _dataViewTimers = {};
  window.startDataViewTimer = function(featureContext) {
    if (_dataViewTimers[featureContext]) return;
    _dataViewTimers[featureContext] = setTimeout(function() {
      showDataValue(featureContext);
    }, 10000); // 10 seconds
  };
  window.cancelDataViewTimer = function(featureContext) {
    if (_dataViewTimers[featureContext]) {
      clearTimeout(_dataViewTimers[featureContext]);
      delete _dataViewTimers[featureContext];
    }
  };

})();

// CS-P1-004 FE-005: Register micro-surveys exports with BJ namespace
(function() {
  ['cancelDataViewTimer','showApplyConfidence','showDataValue','showPaywallFriction','showSearchRelevance','startDataViewTimer','trackSearchForSurvey'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'micro-surveys', registered: Date.now() };
    }
  });
})();


// === js/rewrite.js ===
// js/rewrite.js — AI Resume Rewrite (JD-match "Boost" feature)
// Phase B+C: Panel UI, Q&A flow, diff view, accept/reject actions
// v4.28

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

var _rwState = {
  sessionId: null,
  jobId: null,
  jobTitle: '',
  company: '',
  resumeId: null,
  originalScore: null,
  status: null,         // 'analyzing' | 'questions' | 'ready_to_rewrite' | 'rewriting' | 'checking' | 'completed' | 'failed'
  gapAnalysis: null,
  questions: [],
  userAnswers: {},
  sections: [],
  quality: null,
  newScore: null,
  creditsUsed: 0,
  retryCount: 0,
  pollTimer: null,
};

function _rwReset() {
  if (_rwState.pollTimer) clearInterval(_rwState.pollTimer);
  _rwState = {
    sessionId: null, jobId: null, jobTitle: '', company: '', resumeId: null,
    originalScore: null, status: null, gapAnalysis: null, questions: [],
    userAnswers: {}, sections: [], quality: null, newScore: null,
    creditsUsed: 0, retryCount: 0, pollTimer: null,
  };
}

// ════════════════════════════════════════════════════════════
// PANEL OPEN / CLOSE
// ════════════════════════════════════════════════════════════

function openRewritePanel(jobId, jobTitle, company, resumeId, matchScore) {
  _rwReset();
  _rwState.jobId = jobId;
  _rwState.jobTitle = jobTitle || 'this role';
  _rwState.company = company || '';
  _rwState.resumeId = resumeId;
  _rwState.originalScore = matchScore;

  var panel = document.getElementById('rewrite-panel');
  if (!panel) return;

  // Set header
  var titleEl = document.getElementById('rw-panel-title');
  if (titleEl) titleEl.textContent = _rwState.jobTitle;
  var metaEl = document.getElementById('rw-panel-meta');
  if (metaEl) metaEl.textContent = _rwState.company ? 'at ' + _rwState.company : '';

  // Show panel
  panel.style.display = '';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function () { panel.classList.add('rw-open'); });

  // Escape key handler
  panel._escHandler = function (e) { if (e.key === 'Escape') closeRewritePanel(); };
  document.addEventListener('keydown', panel._escHandler);

  // Start analysis
  _rwStartAnalysis();
}

function closeRewritePanel() {
  if (_rwState.pollTimer) clearInterval(_rwState.pollTimer);
  var panel = document.getElementById('rewrite-panel');
  if (!panel) return;
  panel.classList.remove('rw-open');
  document.body.style.overflow = '';
  if (panel._escHandler) {
    document.removeEventListener('keydown', panel._escHandler);
    panel._escHandler = null;
  }
  setTimeout(function () { panel.style.display = 'none'; }, 300);
}

// ════════════════════════════════════════════════════════════
// ENTITLEMENT + CREDIT CHECKS
// ════════════════════════════════════════════════════════════

async function _rwCanRewrite() {
  if (!currentUser) { showToast('Please log in first.', { type: 'error' }); return false; }

  // Check Pro tier
  var ent = await checkEntitlement('ai_rewrite', 0);
  if (!ent.allowed) {
    showUpgradePrompt('AI Resume Rewrite', ent);
    return false;
  }

  // Check credit balance
  var { data: balance, error: balErr } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balErr) { reportError('rewrite:credit-balance', balErr); showToast('Could not check credit balance. Try again.', { type: 'error' }); return false; }
  if (balance < 3) {
    showToast('This rewrite costs 3 credits. You have ' + balance + '. Purchase more in Settings.', { type: 'error', duration: 5000 });
    return false;
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// PHASE 1: ANALYSIS
// ════════════════════════════════════════════════════════════

async function _rwStartAnalysis() {
  _rwState.status = 'analyzing';
  _rwRenderBody();

  var session = await sb.auth.getSession();
  if (!session?.data?.session?.access_token) {
    showToast('Session expired. Please log in again.', { type: 'error' });
    closeRewritePanel();
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume-analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        resume_id: _rwState.resumeId,
        job_id: _rwState.jobId,
        original_score: _rwState.originalScore,
      }),
    });

    var data = await res.json();

    if (!res.ok || !data.success) {
      var errMsg = data.error || 'Analysis failed';
      if (data.error === 'insufficient_credits') {
        errMsg = 'Insufficient credits (3 required, you have ' + (data.balance || 0) + ')';
      } else if (data.error === 'resume_text_not_found') {
        errMsg = 'Resume text not synced yet. Open your resume on the Resumes page, then try again.';
      } else if (data.error === 'jd_too_brief') {
        errMsg = 'This job description is too brief for AI rewrite. Try a different listing.';
      }
      _rwState.status = 'failed';
      _rwRenderError(errMsg);
      return;
    }

    _rwState.sessionId = data.session_id;
    _rwState.gapAnalysis = data.gap_analysis;
    _rwState.questions = data.questions || [];

    if (_rwState.questions.length > 0) {
      _rwState.status = 'questions';
    } else {
      _rwState.status = 'ready_to_rewrite';
      // No questions — go straight to rewrite
      _rwStartRewrite();
      return;
    }

    _rwRenderBody();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Analysis error:', e);
    _rwState.status = 'failed';
    _rwRenderError('Something went wrong. No credits were deducted. Please try again.');
  }
}

// ════════════════════════════════════════════════════════════
// PHASE 2: Q&A
// ════════════════════════════════════════════════════════════

function _rwSubmitAnswers() {
  // Collect answers from the Q&A cards
  var answers = {};
  _rwState.questions.forEach(function (q) {
    var input = document.getElementById('rw-q-' + q.id);
    var val = input ? input.value.trim() : '';
    answers[q.id] = val || null; // null = skipped
  });
  _rwState.userAnswers = answers;
  _rwStartRewrite();
}

function _rwSkipQuestion(qId) {
  var card = document.getElementById('rw-card-' + qId);
  if (card) {
    card.classList.add('rw-skipped');
    var input = document.getElementById('rw-q-' + qId);
    if (input) { input.value = ''; input.disabled = true; }
  }
  _rwState.userAnswers[qId] = null;
}

// ════════════════════════════════════════════════════════════
// PHASE 3: REWRITE EXECUTION
// ════════════════════════════════════════════════════════════

async function _rwStartRewrite(feedback) {
  _rwState.status = 'rewriting';
  _rwRenderBody();

  var session = await sb.auth.getSession();
  if (!session?.data?.session?.access_token) {
    showToast('Session expired.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume-execute', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        session_id: _rwState.sessionId,
        user_answers: _rwState.userAnswers,
        feedback: feedback || null,
      }),
    });

    var data = await res.json();

    if (!res.ok || !data.success) {
      _rwState.status = 'failed';
      _rwRenderError(data.error || 'Rewrite failed. No credits were deducted.');
      return;
    }

    _rwState.sections = data.sections || [];
    _rwState.quality = data.quality || {};
    _rwState.newScore = data.new_score;
    _rwState.creditsUsed += data.credits_used || 0;
    _rwState.status = 'completed';

    _rwRenderBody();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Execute error:', e);
    _rwState.status = 'failed';
    _rwRenderError('Something went wrong. Please try again.');
  }
}

// ════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════

async function _rwAcceptAll() {
  var acceptBtn = document.querySelector('.rw-actions .btn-primary');
  if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.textContent = 'Generating document…'; }

  try {
    // Build the rewritten text by combining accepted sections (respecting cherry-pick)
    var fullText = '';
    (_rwState.sections || []).forEach(function (s) {
      var useRewrite = s.changed && !s._excluded;
      var text = useRewrite ? s.rewritten : s.original;
      if (text) fullText += text + '\n\n';
    });

    // Generate DOCX
    var docBlob = await _rwBuildDocx(_rwState.sections);

    if (!docBlob) {
      // Fallback: offer plain text download
      _rwDownloadText(fullText);
      showToast('DOCX generation unavailable. Plain text downloaded instead.', { type: 'info' });
      closeRewritePanel();
      return;
    }

    // Upload to Supabase Storage
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    var fileName = 'rewrite_' + (_rwState.company || 'job').replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.docx';
    var storagePath = currentUser.id + '/' + _rwState.sessionId + '/' + fileName;

    var { error: uploadErr } = await sb.storage
      .from('rewrites')
      .upload(storagePath, docBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('[rewrite] Storage upload failed:', uploadErr.message);
      // Still download locally
    }

    // Update session record with file path
    if (_rwState.sessionId) {
      var { error: updErr } = await sb.from('rewrite_sessions').update({
        output_file_path: storagePath,
        status: 'accepted',
      }).eq('id', _rwState.sessionId);
      if (updErr) reportError('rewrite:session-update', updErr);
    }

    // Auto-download
    var url = URL.createObjectURL(docBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

    showToast('Resume rewrite downloaded! File saved to your account.', { type: 'success', duration: 5000 });
    closeRewritePanel();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Accept error:', e);
    showToast('Download failed: ' + e.message, { type: 'error' });
    if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.textContent = 'Accept All'; }
  }
}

// ─── DOCX Builder (client-side via docx-js UMD) ───
async function _rwBuildDocx(sections) {
  if (typeof docx === 'undefined') {
    console.warn('[rewrite] docx library not loaded');
    return null;
  }

  var children = [];

  sections.forEach(function (s) {
    var text = s.changed ? s.rewritten : s.original;
    if (!text) return;

    // Section heading
    children.push(new docx.Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new docx.TextRun({
        text: (s.name || 'Section').toUpperCase(),
        bold: true,
        size: 24,
        font: 'Calibri',
        color: '2B2B2B',
      })],
    }));

    // Section content — split by lines
    text.split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;

      // Detect bullet points
      var isBullet = /^[\u2022\-\*]\s/.test(line);
      var cleanLine = isBullet ? line.replace(/^[\u2022\-\*]\s*/, '') : line;

      if (isBullet) {
        children.push(new docx.Paragraph({
          spacing: { after: 40 },
          indent: { left: 360, hanging: 260 },
          children: [
            new docx.TextRun({ text: '\u2022 ', font: 'Calibri', size: 22, color: '666666' }),
            new docx.TextRun({ text: cleanLine, font: 'Calibri', size: 22, color: '333333' }),
          ],
        }));
      } else {
        children.push(new docx.Paragraph({
          spacing: { after: 60 },
          children: [new docx.TextRun({
            text: cleanLine,
            font: 'Calibri',
            size: 22,
            color: '333333',
          })],
        }));
      }
    });
  });

  var doc = new docx.Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: children,
    }],
  });

  return await docx.Packer.toBlob(doc);
}

// ─── Plaintext fallback ───
function _rwDownloadText(text) {
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'rewrite_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}

function _rwTryAgain() {
  if (_rwState.retryCount >= 2) {
    showToast('Maximum retries reached (2). Please start a new rewrite.', { type: 'error' });
    return;
  }
  _rwState.retryCount++;

  var feedbackInput = document.getElementById('rw-feedback-input');
  var feedback = feedbackInput ? feedbackInput.value.trim() : '';

  if (!feedback) {
    showToast('Please describe what you\'d like changed.', { type: 'error' });
    return;
  }

  _rwStartRewrite({ text: feedback, retry: _rwState.retryCount });
}

// ════════════════════════════════════════════════════════════
// RENDERING
// ════════════════════════════════════════════════════════════

function _rwRenderBody() {
  var body = document.getElementById('rw-panel-body');
  if (!body) return;

  switch (_rwState.status) {
    case 'analyzing':
      body.innerHTML = _rwRenderAnalyzing();
      break;
    case 'questions':
      body.innerHTML = _rwRenderQuestions();
      break;
    case 'ready_to_rewrite':
    case 'rewriting':
    case 'checking':
      body.innerHTML = _rwRenderRewriting();
      break;
    case 'completed':
      body.innerHTML = _rwRenderResults();
      break;
    case 'failed':
      // Handled by _rwRenderError
      break;
    default:
      body.innerHTML = '';
  }
}

function _rwRenderError(msg) {
  var body = document.getElementById('rw-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="rw-error">' +
    '<div class="rw-error-icon">!</div>' +
    '<div class="rw-error-msg">' + msg + '</div>' +
    '<button class="btn btn-sm" onclick="_rwStartAnalysis()" style="margin-top:16px;">Try Again</button>' +
    '</div>';
}

// ─── State 1: Analyzing ───
function _rwRenderAnalyzing() {
  return '<div class="rw-loading">' +
    '<div class="rw-spinner"></div>' +
    '<div class="rw-loading-text">Analyzing your resume against<br><strong>' +
    _rwState.jobTitle + '</strong>' +
    (_rwState.company ? ' at <strong>' + _rwState.company + '</strong>' : '') +
    '</div>' +
    '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-active">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Rewrite</span>' +
    '</div>' +
    '</div>';
}

// ─── State 2: Questions ───
function _rwRenderQuestions() {
  var ga = _rwState.gapAnalysis || {};
  var html = '<div class="rw-qa-section">';

  // Summary bar
  html += '<div class="rw-summary">' +
    '<div class="rw-summary-row">' +
    '<span class="rw-stat"><strong>' + (ga.matched_count || 0) + '</strong> matched</span>' +
    '<span class="rw-stat"><strong>' + (ga.rewritable_count || 0) + '</strong> can improve</span>' +
    '<span class="rw-stat"><strong>' + (ga.needs_input_count || 0) + '</strong> need your input</span>' +
    '</div>' +
    (ga.summary ? '<div class="rw-summary-text">' + ga.summary + '</div>' : '') +
    '</div>';

  // Progress dots
  html += '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-active">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Rewrite</span>' +
    '</div>';

  // Question cards
  _rwState.questions.forEach(function (q, i) {
    html += '<div class="rw-qa-card" id="rw-card-' + q.id + '">' +
      '<div class="rw-qa-label">Question ' + (i + 1) + ' of ' + _rwState.questions.length + '</div>' +
      '<div class="rw-qa-context">' +
      '<div class="rw-qa-jd"><strong>JD requires:</strong> ' + (q.jd_context || q.skill || '') + '</div>' +
      (q.resume_context ? '<div class="rw-qa-resume"><strong>Your resume:</strong> ' + q.resume_context + '</div>' : '') +
      '</div>' +
      '<div class="rw-qa-question">' + q.question + '</div>' +
      '<textarea id="rw-q-' + q.id + '" class="rw-qa-input" placeholder="' +
      (q.placeholder || 'Type your answer...').replace(/"/g, '&quot;') +
      '" rows="3"></textarea>' +
      '<button class="rw-skip-btn" onclick="_rwSkipQuestion(\'' + q.id + '\')">Skip this question</button>' +
      '</div>';
  });

  // Continue button
  html += '<div class="rw-qa-actions">' +
    '<button class="btn btn-primary" onclick="_rwSubmitAnswers()">Continue to Rewrite</button>' +
    '</div>';

  html += '</div>';
  return html;
}

// ─── Rewriting loading ───
function _rwRenderRewriting() {
  return '<div class="rw-loading">' +
    '<div class="rw-spinner"></div>' +
    '<div class="rw-loading-text">Rewriting your resume' +
    (_rwState.retryCount > 0 ? ' (revision ' + _rwState.retryCount + ')' : '') +
    '</div>' +
    '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-active">Rewrite</span>' +
    '</div>' +
    '</div>';
}

// ─── State 3: Results (diff view) ───
function _rwRenderResults() {
  var q = _rwState.quality || {};
  var html = '<div class="rw-results">';

  // Score improvement bar
  html += '<div class="rw-score-bar">';
  if (_rwState.originalScore != null && _rwState.newScore != null) {
    var improvement = _rwState.newScore - _rwState.originalScore;
    html += '<div class="rw-score-change">' +
      '<span class="rw-score-old">' + _rwState.originalScore + '%</span>' +
      '<span class="rw-score-arrow">&rarr;</span>' +
      '<span class="rw-score-new">' + _rwState.newScore + '%</span>' +
      (improvement > 0 ? '<span class="rw-score-delta">+' + improvement + '</span>' : '') +
      '</div>';
  }
  if (q.truthfulness_pass !== false) {
    html += '<div class="rw-verified">Verified — no fabricated content</div>';
  } else {
    html += '<div class="rw-warning">Review flagged — some claims may need verification</div>';
  }
  html += '</div>';

  // Progress dots
  html += '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Rewrite</span>' +
    '</div>';

  // Diff sections
  html += '<div class="rw-diff">';
  (_rwState.sections || []).forEach(function (s) {
    var changed = s.changed;
    html += '<div class="rw-diff-section' + (changed ? ' rw-diff-changed' : ' rw-diff-unchanged') + '">' +
      '<div class="rw-diff-header">' +
      (changed ? '<div class="rw-cherry-pick"><input type="checkbox" id="rw-pick-' + si + '" checked onchange="_rwToggleSection(' + si + ')"><label for="rw-pick-' + si + '">Include</label></div>' : '') +
      '<span class="rw-diff-name">' + (s.name || 'Section') + '</span>' +
      (changed ? '<span class="rw-diff-badge">Modified</span>' : '<span class="rw-diff-badge rw-diff-badge-same">No changes</span>') +
      '</div>';

    if (changed) {
      html += '<div class="rw-diff-cols">' +
        '<div class="rw-diff-col rw-diff-original">' +
        '<div class="rw-diff-col-label">Original</div>' +
        '<div class="rw-diff-col-text">' + _rwHighlightDiff(s.original || '', s.rewritten || '', 'original') + '</div>' +
        '</div>' +
        '<div class="rw-diff-col rw-diff-rewritten">' +
        '<div class="rw-diff-col-label">Rewritten</div>' +
        '<div class="rw-diff-col-text">' + _rwHighlightDiff(s.original || '', s.rewritten || '', 'rewritten') + '</div>' +
        '</div>' +
        '</div>';
      if (s.changes_made && s.changes_made.length > 0) {
        html += '<div class="rw-diff-changes"><strong>Changes:</strong> ' +
          s.changes_made.map(function (c) { return _rwEscapeHtml(c); }).join(' · ') +
          '</div>';
      }
    }

    html += '</div>';
  });
  html += '</div>';

  // Actions
  var changedCount = _rwState.sections.filter(function(s){ return s.changed; }).length;
  html += '<div class="rw-actions">' +
    '<button class="btn btn-primary" onclick="_rwAcceptAll()">' + (changedCount > 1 ? 'Accept Selected (' + changedCount + ')' : 'Accept All') + '</button>' +
    '<div class="rw-retry-section">' +
    '<textarea id="rw-feedback-input" class="rw-qa-input" placeholder="What should be different? (e.g. too aggressive, keep my summary)" rows="2" style="margin-bottom:8px;"></textarea>' +
    '<button class="btn btn-sm" onclick="_rwTryAgain()" style="font-size:11px;">' +
    'Try Again (+1 credit)' + (_rwState.retryCount >= 2 ? ' — max reached' : '') +
    '</button>' +
    '</div>' +
    '<button class="btn btn-sm" onclick="closeRewritePanel()" style="margin-top:8px;font-size:11px;color:var(--text-faint);">Cancel — no credits deducted</button>' +
    '</div>';

  // Keywords added
  if (_rwState.sections.some(function (s) { return s.changed; })) {
    var kws = [];
    _rwState.sections.forEach(function (s) { if (s.keywords_added) kws = kws.concat(s.keywords_added); });
    if (_rwState.quality && _rwState.quality.keyword_coverage) {
      html += '<div class="rw-keywords-bar" style="margin-top:16px;font-size:11px;color:var(--text-faint);">' +
        'Keyword coverage: <strong>' + _rwState.quality.keyword_coverage + '%</strong> of JD terms' +
        (kws.length > 0 ? ' · Added: ' + kws.slice(0, 8).join(', ') : '') +
        '</div>';
    }
  }

  html += '</div>';
  return html;
}

function _rwEscapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Word-level diff highlighting
function _rwHighlightDiff(original, rewritten, side) {
  var origWords = original.split(/(\s+)/);
  var newWords = rewritten.split(/(\s+)/);

  // Simple LCS-based word diff
  if (origWords.length > 300 || newWords.length > 300) {
    // Too long for word diff — fall back to plain escaped
    return _rwEscapeHtml(side === 'original' ? original : rewritten);
  }

  var origSet = new Set(origWords.filter(function(w){ return w.trim(); }));
  var newSet = new Set(newWords.filter(function(w){ return w.trim(); }));

  if (side === 'original') {
    return origWords.map(function(w) {
      if (!w.trim()) return w;
      var esc = _rwEscapeHtml(w);
      if (!newSet.has(w)) return '<span class="rw-diff-remove">' + esc + '</span>';
      return esc;
    }).join('');
  } else {
    return newWords.map(function(w) {
      if (!w.trim()) return w;
      var esc = _rwEscapeHtml(w);
      if (!origSet.has(w)) return '<span class="rw-diff-add">' + esc + '</span>';
      return esc;
    }).join('');
  }
}

// Cherry-pick section toggle
window._rwToggleSection = function(sectionIdx) {
  if (!_rwState.sections || !_rwState.sections[sectionIdx]) return;
  var cb = document.getElementById('rw-pick-' + sectionIdx);
  _rwState.sections[sectionIdx]._excluded = cb ? !cb.checked : false;

  // Update accept button count
  var included = _rwState.sections.filter(function(s){ return s.changed && !s._excluded; }).length;
  var btn = document.querySelector('.rw-actions .btn-primary');
  if (btn) btn.textContent = included > 0 ? 'Accept Selected (' + included + ')' : 'Accept Selected (0)';
};

// ════════════════════════════════════════════════════════════
// ENTRY POINT: "Boost" CTA on Jobs Feed match column
// ════════════════════════════════════════════════════════════

function boostMatch(jobId, jobTitle, company) {
  // Find the assigned resume for the active filter
  var activeFilter = savedFilters[activeFilterIdx];
  if (!activeFilter) { showToast('Select a filter first.', { type: 'error' }); return; }

  // Find assigned resume for this filter
  var assignedResume = null;
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].filterAssignments) {
      var fa = resumes[i].filterAssignments;
      if (fa[activeFilter.name] || fa[activeFilterIdx]) {
        assignedResume = resumes[i];
        break;
      }
    }
  }

  if (!assignedResume) {
    // Fallback: use default resume
    assignedResume = resumes.find(function (r) { return !r.archived && r.isDefault; }) ||
      resumes.find(function (r) { return !r.archived; });
  }

  if (!assignedResume) {
    showToast('Upload a resume on the Resumes page first, then come back to Boost.', { type: 'error', duration: 5000 });
    return;
  }

  // Check if resume text has been extracted
  if (!assignedResume.extractedText || assignedResume.extractedText.length < 50) {
    showToast('Resume text not ready. Open your resume on the Resumes page to extract it, then try again.', { type: 'error', duration: 5000 });
    return;
  }

  var matchScore = jobMatchScores[jobId];
  if (typeof matchScore === 'object') matchScore = matchScore.score;

  // Already A+ match — celebrate instead
  if (matchScore != null && matchScore >= 95) {
    showToast('Your resume is already a 95%+ match for this role! No rewrite needed.', { type: 'success', duration: 4000 });
    return;
  }

  openRewritePanel(jobId, jobTitle, company, assignedResume.id, matchScore);
}

// ════════════════════════════════════════════════════════════
// ENHANCED matchBadge — adds "Boost" pill when match < 85%
// ════════════════════════════════════════════════════════════

var _origMatchBadge = typeof matchBadge === 'function' ? matchBadge : null;

function matchBadgeWithBoost(result, jobId, jobTitle, company) {
  if (!result) return '<span style="color:var(--text-faint);font-size:10px;">\u2014</span>';
  var score = typeof result === 'number' ? result : result.score;
  var rName = typeof result === 'object' ? (result.resumeName || '') : '';
  var g = scoreToGrade(score);
  var tooltip = score + '% match' + (rName ? ' \u00b7 ' + rName.replace(/"/g, '&quot;') : '');

  var badge = '<span title="' + tooltip + '" style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + g.color + ';cursor:help;">' + g.grade + '</span>';

  // Add Boost pill for scores < 85 (and user has a resume assigned)
  if (score != null && score < 85 && jobId) {
    var safeTitle = (jobTitle || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var safeCo = (company || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    badge += ' <button class="rw-boost-pill" onclick="event.stopPropagation();boostMatch(\'' +
      jobId + "','" + safeTitle + "','" + safeCo +
      '\')" title="AI-rewrite your resume to better match this role">Boost</button>';
  }

  return badge;
}

// CS-P1-004 FE-005: Register rewrite exports with BJ namespace
(function() {
  ['_rwToggleSection'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'rewrite', registered: Date.now() };
    }
  });
})();


// === js/resume-archive.js ===
// === Resume Archive Module ===
// Phase 3: Archive tab UI with database-backed storage, version tracking, and tier info

// Tab switching
window.switchResumeTab = function(tab) {
  const activeContent = $('#resume-tab-content-active');
  const archiveContent = $('#resume-tab-content-archive');
  const activeBtn = $('#resume-tab-active');
  const archiveBtn = $('#resume-tab-archive');
  if (!activeContent || !archiveContent) return;

  if (tab === 'archive') {
    activeContent.classList.add('u-hidden');
    archiveContent.classList.remove('u-hidden');
    activeBtn.classList.remove('active');
    archiveBtn.classList.add('active');
    loadResumeArchive();
  } else {
    activeContent.classList.remove('u-hidden');
    archiveContent.classList.add('u-hidden');
    activeBtn.classList.add('active');
    archiveBtn.classList.remove('active');
  }

  // Support URL hash linking: #resumes?tab=archive
  if (tab === 'archive') {
    history.replaceState(null, '', '#resumes?tab=archive');
  } else {
    history.replaceState(null, '', '#resumes');
  }
};

// Check URL hash on page load for deep-link
function checkArchiveDeepLink() {
  const hash = location.hash;
  if (hash.includes('tab=archive')) {
    setTimeout(function() { switchResumeTab('archive'); }, 200);
  }
  // Also check for specific resume ID
  const match = hash.match(/id=([a-f0-9-]+)/);
  if (match) {
    _archiveHighlightId = match[1];
  }
}
var _archiveHighlightId = null;

// Load archive data from Supabase
window.loadResumeArchive = async function() {
  const body = $('#archive-table-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-faint);">Loading…</td></tr>';

  try {
    // Fetch archive data (CS-015: FE-004 — limit query + paginate)
    const RA_PAGE_SIZE = 100;
    const { data: archives, error } = await sb
      .from('resume_archive')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, RA_PAGE_SIZE - 1);

    if (error) throw error;

    // Fetch tier limits
    const { data: limits, error: limErr } = await sb.rpc('check_resume_limits', {
      p_user_id: (await sb.auth.getUser()).data.user.id
    });

    if (!limErr && limits) {
      updateStorageBar(limits);
      updateArchiveStats(archives, limits);
    }

    renderArchiveTable(archives || []);
  } catch (e) {
    reportError('resume_archive', e);
    console.log('[BJ] Archive load error:', e.message);
    body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--red);">Failed to load archive: ' + e.message + '</td></tr>';
  }
};

function updateStorageBar(limits) {
  const bar = $('#archive-storage-bar');
  const label = $('#archive-storage-label');
  const cta = $('#archive-tier-cta');
  if (!bar || !label) return;

  const used = limits.current_storage || 0;
  const max = limits.limits?.storage_bytes || 52428800;
  const pct = Math.min((used / max) * 100, 100);

  bar.style.width = pct.toFixed(1) + '%';
  bar.style.background = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--warm)' : 'var(--accent)';
  label.textContent = formatBytes(used) + ' / ' + formatBytes(max);

  if (cta) {
    cta.style.display = pct > 80 && limits.tier !== 'pro' ? '' : 'none';
  }
}

function updateArchiveStats(archives, limits) {
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('arch-total', archives.length);
  el('arch-active', archives.filter(a => a.is_active).length);
  el('arch-versions', archives.reduce((sum, a) => sum + a.version_number, 0));
  el('arch-tier', (limits.tier || 'free').charAt(0).toUpperCase() + (limits.tier || 'free').slice(1));
}

function renderArchiveTable(archives) {
  const body = $('#archive-table-body');
  const search = $('#archive-search');
  if (!body) return;

  // Filter by search
  let filtered = archives;
  if (search && search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    filtered = archives.filter(a =>
      a.display_name.toLowerCase().includes(q) ||
      (a.file_type || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    body.innerHTML = '<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-faint);">No archived resumes found</td></tr>';
    return;
  }

  body.innerHTML = filtered.map(a => {
    const isExpired = a.metadata_snapshot?.soft_deleted === true;
    const statusBadge = isExpired
      ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--red)15;color:var(--red);font-size:10px;font-weight:600;">Expired</span>'
      : a.is_active
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--green)15;color:var(--green);font-size:10px;font-weight:600;">Active</span>'
        : a.is_archived
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--warm)15;color:var(--warm);font-size:10px;font-weight:600;">Archived</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--text-faint)15;color:var(--text-faint);font-size:10px;font-weight:600;">Inactive</span>';

    // Show expiry countdown for archived resumes
    const expiryInfo = a.is_archived && a.archive_expires_at && !isExpired
      ? (() => {
          const days = Math.ceil((new Date(a.archive_expires_at) - new Date()) / 86400000);
          if (days <= 7) return `<div style="font-size:9px;color:var(--red);margin-top:2px;">Expires in ${days}d</div>`;
          if (days <= 30) return `<div style="font-size:9px;color:var(--warm);margin-top:2px;">Expires in ${days}d</div>`;
          return '';
        })()
      : '';

    const levelBadge = a.metadata_snapshot?.level_label
      ? `<span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:4px;background:${a.metadata_snapshot.level_color || '#94a3b8'}15;color:${a.metadata_snapshot.level_color || '#94a3b8'};">${a.metadata_snapshot.level_label}</span>`
      : '';

    const highlight = _archiveHighlightId === a.resume_id ? 'background:var(--accent)08;' : '';

    return `<tr style="border-bottom:1px solid var(--border);${highlight}" data-resume-id="${a.resume_id}">
      <td style="padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <i data-lucide="file-text" class="icon-sm icon-stroke" style="stroke:var(--text-faint);"></i>
          <div>
            <div style="font-weight:600;color:var(--text);">${a.display_name}</div>
            <div style="font-size:10px;color:var(--text-faint);">${a.file_type.toUpperCase()} ${levelBadge}</div>
          </div>
        </div>
      </td>
      <td style="padding:10px 12px;font-family:var(--mono);font-size:11px;color:var(--text-dim);">v${a.version_number}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);">${formatDate(a.created_at)}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);">${a.last_used_at ? formatDate(a.last_used_at) : '—'}</td>
      <td style="padding:10px 12px;font-size:11px;color:var(--text-dim);font-family:var(--mono);">${formatBytes(a.compressed_size_bytes || a.file_size_bytes)}</td>
      <td style="padding:10px 12px;">${statusBadge}${expiryInfo}</td>
      <td style="padding:10px 12px;">
        <div style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="showVersionTimeline('${a.resume_id}')" style="font-size:10px;padding:3px 8px;" title="Version history">History</button>
          ${a.is_archived || isExpired ? `<button class="btn btn-sm" onclick="restoreArchiveResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--accent);color:#fff;" title="Restore">${isExpired ? 'Restore ↑' : 'Restore'}</button>` : ''}
          ${a.is_active ? `<button class="btn btn-sm" onclick="archiveDbResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--warm);color:#000;" title="Archive">Archive</button>` : ''}
          <button class="btn btn-sm" onclick="deleteArchiveResume('${a.resume_id}')" style="font-size:10px;padding:3px 8px;background:var(--red);color:#fff;" title="Delete">Del</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  _archiveHighlightId = null;
}

// Version timeline
window.showVersionTimeline = async function(resumeId) {
  const timeline = $('#archive-version-timeline');
  const list = $('#archive-version-list');
  if (!timeline || !list) return;

  timeline.style.display = '';
  list.innerHTML = '<div style="padding:16px;color:var(--text-faint);font-size:12px;">Loading versions…</div>';

  try {
    // Get the resume and all versions in its lineage
    const resume = await safeQuery(() => sb.from('resume_archive').select('*').eq('resume_id', resumeId).single(), { label: 'resume-archive:resume_archive', fallback: null });
    if (!resume) return;

    // Find all versions: same display_name or linked by parent
    const versions = await safeQuery(() => sb.from('resume_archive').select('*')
      .eq('user_id', resume.user_id)
      .eq('display_name', resume.display_name)
      .order('version_number', { ascending: false }), { label: 'resume-archive:resume_archive', fallback: [] });

    if (!versions || versions.length === 0) {
      list.innerHTML = '<div style="padding:16px;color:var(--text-faint);font-size:12px;">No version history found</div>';
      return;
    }

    list.innerHTML = versions.map((v, idx) => {
      const isCurrent = v.resume_id === resumeId;
      const dot = v.is_active
        ? '<div style="width:10px;height:10px;border-radius:50%;background:var(--green);flex-shrink:0;"></div>'
        : '<div style="width:10px;height:10px;border-radius:50%;background:var(--border);flex-shrink:0;"></div>';
      const connector = idx < versions.length - 1
        ? '<div style="position:absolute;left:4px;top:14px;bottom:-14px;width:2px;background:var(--border);"></div>'
        : '';

      return `<div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;position:relative;${isCurrent ? 'background:var(--bg-input);border-radius:8px;padding:8px 12px;margin:-4px -12px;' : ''}">
        <div style="position:relative;">${dot}${connector}</div>
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-weight:600;font-size:12px;color:var(--text);">v${v.version_number}</span>
            ${v.is_active ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--green)15;color:var(--green);font-weight:600;">Current</span>' : ''}
            ${v.is_archived ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--warm)15;color:var(--warm);font-weight:600;">Archived</span>' : ''}
          </div>
          <div style="font-size:10px;color:var(--text-faint);margin-top:2px;">
            ${formatDate(v.created_at)} · ${formatBytes(v.compressed_size_bytes || v.file_size_bytes)} · ${v.file_type.toUpperCase()}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = '<div style="padding:16px;color:var(--red);font-size:12px;">Error: ' + e.message + '</div>';
  }
};

// Archive a resume (move from active to archived)
window.archiveDbResume = async function(resumeId) {
  if (!confirm('Archive this resume? It will be compressed and moved to cold storage.')) return;
  try {
    // Get tier to set expiry
    const userId = (await sb.auth.getUser()).data.user.id;
    const { data: limits } = await sb.rpc('check_resume_limits', { p_user_id: userId });
    const tier = limits?.tier || 'free';

    // Calculate expiry: Free=30d, Starter=90d, Pro=null
    let expiresAt = null;
    if (tier === 'free') {
      expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    } else if (tier === 'starter') {
      expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
    }

    const { error } = await sb.from('resume_archive')
      .update({
        is_active: false,
        is_archived: true,
        archived_at: new Date().toISOString(),
        archive_expires_at: expiresAt
      })
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Archive failed: ' + e.message);
  }
};

// Restore an archived resume
window.restoreArchiveResume = async function(resumeId) {
  try {
    const { error } = await sb.from('resume_archive')
      .update({ is_active: true, is_archived: false, archived_at: null })
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
};

// Delete a resume from archive
window.deleteArchiveResume = async function(resumeId) {
  if (!confirm('Permanently delete this resume from the archive? This cannot be undone.')) return;
  try {
    const { error } = await sb.from('resume_archive')
      .delete()
      .eq('resume_id', resumeId);
    if (error) throw error;
    loadResumeArchive();
  } catch (e) {
    alert('Delete failed: ' + e.message);
  }
};

// Helpers
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Search filter
(function() {
  const searchEl = document.getElementById('archive-search');
  if (searchEl) {
    let _debounce;
    searchEl.addEventListener('input', function() {
      clearTimeout(_debounce);
      _debounce = setTimeout(function() { loadResumeArchive(); }, 300);
    });
  }
})();

// Check deep link on load
if (typeof checkArchiveDeepLink === 'function') checkArchiveDeepLink();

// Phase 4: Enhanced restore using server-side function
window.restoreArchiveResume = async function(resumeId) {
  try {
    const { data, error } = await sb.rpc('restore_archived_resume', {
      p_resume_id: resumeId
    });
    if (error) throw error;
    if (data && !data.success) {
      if (data.error === 'EXPIRED_UPGRADE_REQUIRED') {
        if (confirm(data.message + '\n\nGo to subscription page?')) {
          showPage('subscription');
        }
        return;
      }
      alert('Restore failed: ' + (data.error || 'Unknown error'));
      return;
    }
    loadResumeArchive();
  } catch (e) {
    alert('Restore failed: ' + e.message);
  }
};

// CS-P1-004 FE-005: Register resume-archive exports with BJ namespace
(function() {
  ['archiveDbResume','deleteArchiveResume','loadResumeArchive','restoreArchiveResume','showVersionTimeline','switchResumeTab'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'resume-archive', registered: Date.now() };
    }
  });
})();


// === js/resume-metrics.js ===
// === Resume Metrics Module ===
// Phase 6: Resume Metrics Intelligence UI — score history, level fit, pipeline funnel, usage log

var _metricsCharts = {};

/** Resolve a CSS custom property to its computed value (for ECharts which needs raw colors) */
function _cssColor(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// Tab switching for Stats page
window.switchStatsTab = function(tab) {
  const marketContent = $('#stats-tab-content-market');
  const resumeContent = $('#stats-tab-content-resume');
  const marketBtn = $('#stats-tab-market');
  const resumeBtn = $('#stats-tab-resume');
  if (!marketContent || !resumeContent) return;

  if (tab === 'resume') {
    marketContent.style.display = 'none';
    resumeContent.style.display = '';
    marketBtn.classList.remove('active');
    resumeBtn.classList.add('active');
    populateResumeSelector();
    // Check URL for pre-selected resume
    const match = location.hash.match(/resume=([a-f0-9-]+)/);
    if (match) {
      const sel = $('#metrics-resume-select');
      if (sel) { sel.value = match[1]; loadResumeMetrics(); }
    }
  } else {
    marketContent.style.display = '';
    resumeContent.style.display = 'none';
    marketBtn.classList.add('active');
    resumeBtn.classList.remove('active');
    // Dispose metrics charts to free memory
    Object.values(_metricsCharts).forEach(c => { try { c.dispose(); } catch(e) { /* chart cleanup - expected */ } });
    _metricsCharts = {};
  }
};

// Populate resume dropdown from resume_archive
async function populateResumeSelector() {
  const sel = $('#metrics-resume-select');
  if (!sel) return;

  try {
    const { data, error } = await sb.from('resume_archive')
      .select('resume_id, display_name, version_number, is_active, metadata_snapshot')
      .eq('is_active', true)
      .order('display_name');

    if (error) throw error;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">Select a resume…</option>';
    (data || []).forEach(r => {
      const level = r.metadata_snapshot?.level_label || '';
      const opt = document.createElement('option');
      opt.value = r.resume_id;
      opt.textContent = r.display_name + (level ? ' (' + level + ')' : '') + ' v' + r.version_number;
      sel.appendChild(opt);
    });
    if (currentVal) sel.value = currentVal;
  } catch (e) {
    reportError('resume_metrics', e);
    console.log('[BJ] Resume selector error:', e.message);
  }
}

// Load metrics for selected resume
window.loadResumeMetrics = async function() {
  const sel = $('#metrics-resume-select');
  const resumeId = sel ? sel.value : '';
  const empty = $('#metrics-empty');
  const summary = $('#metrics-score-summary');
  const grid = $('#metrics-charts-grid');
  const log = $('#metrics-usage-log');

  if (!resumeId) {
    if (empty) empty.style.display = '';
    if (summary) summary.style.display = 'none';
    if (grid) grid.style.display = 'none';
    if (log) log.style.display = 'none';
    return;
  }

  if (empty) empty.style.display = 'none';

  try {
    // Fetch score history
    const { data: scores, error: scoreErr } = await sb
      .from('resume_score_history')
      .select('*')
      .eq('resume_id', resumeId)
      .order('scored_at', { ascending: false })
      .limit(50);

    // Fetch job usage
    const { data: usage, error: usageErr } = await sb
      .from('resume_job_usage')
      .select('*')
      .eq('resume_id', resumeId)
      .order('applied_at', { ascending: false })
      .limit(100);

    renderScoreSummary(scores || []);
    renderLevelFitChart(scores || []);
    renderPipelineFunnel(usage || []);
    renderUsageLog(usage || []);

    if (summary) summary.style.display = '';
    if (grid) grid.style.display = '';
    if (log) log.style.display = (usage && usage.length > 0) ? '' : 'none';

    // Update archive cross-link
    const archiveLink = $('#metrics-view-archive');
    if (archiveLink) {
      archiveLink.href = '#resumes?tab=archive&id=' + resumeId;
    }
  } catch (e) {
    reportError('resume_metrics', e);
    console.log('[BJ] Metrics load error:', e.message);
  }
};

// Score summary + sparkline
function renderScoreSummary(scores) {
  const lastScoreEl = $('#metrics-last-score');
  const typeEl = $('#metrics-last-score-type');
  const detailEl = $('#metrics-last-score-detail');

  if (scores.length === 0) {
    if (lastScoreEl) lastScoreEl.textContent = '—';
    if (typeEl) typeEl.textContent = 'No scores yet';
    if (detailEl) detailEl.textContent = 'Score a resume against job descriptions to see metrics here.';
    renderSparkline([]);
    return;
  }

  const latest = scores[0];
  if (lastScoreEl) lastScoreEl.textContent = latest.match_score != null ? Math.round(latest.match_score) : '—';
  if (typeEl) typeEl.textContent = (latest.score_type === 'ai' ? 'AI Score' : latest.score_type === 'ngram' ? 'Keyword Match' : 'Manual') +
    (latest.job_title ? ' · ' + latest.job_title : '');
  if (detailEl) detailEl.textContent = (latest.fit_status || '') +
    (latest.company_name ? ' · ' + latest.company_name : '') +
    ' · ' + formatMetricsDate(latest.scored_at);

  // Sparkline data (last 10, chronological)
  const sparkData = scores.slice(0, 10).reverse().map(s => ({
    date: formatMetricsDate(s.scored_at),
    score: s.match_score ? Math.round(s.match_score) : 0
  }));
  renderSparkline(sparkData);
}

function renderSparkline(data) {
  const el = document.getElementById('metrics-sparkline');
  if (!el || typeof echarts === 'undefined') return;

  if (_metricsCharts.sparkline) { try { _metricsCharts.sparkline.dispose(); } catch(e) { /* chart cleanup - expected */ } }
  if (data.length < 2) { el.innerHTML = ''; return; }

  const chart = echarts.init(el, null, { renderer: 'svg' });
  _metricsCharts.sparkline = chart;

  chart.setOption({
    grid: { top: 4, right: 4, bottom: 4, left: 4 },
    xAxis: { type: 'category', show: false, data: data.map(d => d.date) },
    yAxis: { type: 'value', show: false, min: 0, max: 100 },
    series: [{
      type: 'line',
      data: data.map(d => d.score),
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
        { offset: 0, color: 'rgba(59,130,246,0.3)' },
        { offset: 1, color: 'rgba(59,130,246,0.02)' }
      ]}}
    }]
  });
}

// Level fit bar chart
function renderLevelFitChart(scores) {
  const el = document.getElementById('metrics-level-chart');
  const insightEl = $('#metrics-level-fit-insight');
  if (!el || typeof echarts === 'undefined') return;

  if (_metricsCharts.levelFit) { try { _metricsCharts.levelFit.dispose(); } catch(e) { /* chart cleanup - expected */ } }

  // Group scores by level_fit
  const levels = ['Entry', 'Mid', 'Senior', 'Lead', 'Executive'];
  const levelScores = {};
  levels.forEach(l => { levelScores[l] = []; });

  scores.forEach(s => {
    if (s.level_fit) {
      const key = s.level_fit.charAt(0).toUpperCase() + s.level_fit.slice(1);
      if (levelScores[key]) levelScores[key].push(s.match_score || 0);
    }
  });

  const chartData = levels.map(l => ({
    name: l,
    avg: levelScores[l].length > 0 ? Math.round(levelScores[l].reduce((a,b) => a+b, 0) / levelScores[l].length) : 0,
    count: levelScores[l].length
  })).filter(d => d.count > 0);

  if (chartData.length === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:12px;">No level data yet</div>';
    if (insightEl) insightEl.textContent = '';
    return;
  }

  // Generate insight
  if (insightEl && chartData.length >= 2) {
    const sorted = [...chartData].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const diff = best.avg - worst.avg;
    insightEl.textContent = `This resume scores ${diff}% higher on ${best.name}-level roles than ${worst.name}-level roles`;
  }

  const chart = echarts.init(el, null, { renderer: 'svg' });
  _metricsCharts.levelFit = chart;

  chart.setOption({
    grid: { top: 8, right: 16, bottom: 24, left: 80 },
    xAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#94a3b8', fontSize: 10 }, splitLine: { lineStyle: { color: '#2a2d35' } } },
    yAxis: { type: 'category', data: chartData.map(d => d.name), axisLabel: { color: '#f0f1f3', fontSize: 11 } },
    series: [{
      type: 'bar',
      data: chartData.map(d => ({
        value: d.avg,
        itemStyle: { color: d.avg >= 70 ? _cssColor('--green') : d.avg >= 50 ? _cssColor('--warm') : _cssColor('--red'), borderRadius: [0, 4, 4, 0] }
      })),
      barWidth: 20,
      label: { show: true, position: 'right', color: '#94a3b8', fontSize: 10, formatter: '{c}%' }
    }]
  });
}

// Pipeline funnel
function renderPipelineFunnel(usage) {
  const el = document.getElementById('metrics-funnel-chart');
  if (!el || typeof echarts === 'undefined') return;

  if (_metricsCharts.funnel) { try { _metricsCharts.funnel.dispose(); } catch(e) { /* chart cleanup - expected */ } }

  const stages = ['applied', 'screened', 'interview', 'offer'];
  const stageLabels = { applied: 'Applied', screened: 'Screened', interview: 'Interview', offer: 'Offer' };
  const rejected = usage.filter(u => u.pipeline_stage === 'rejected').length;

  const funnelData = stages.map(s => ({
    name: stageLabels[s],
    value: usage.filter(u => {
      const idx = stages.indexOf(u.pipeline_stage);
      return idx >= stages.indexOf(s);
    }).length
  }));

  if (funnelData[0].value === 0) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:12px;">No pipeline data yet</div>';
    return;
  }

  const chart = echarts.init(el, null, { renderer: 'svg' });
  _metricsCharts.funnel = chart;

  chart.setOption({
    tooltip: { trigger: 'item', formatter: function(p) {
      const pct = funnelData[0].value > 0 ? Math.round((p.value / funnelData[0].value) * 100) : 0;
      return p.name + ': ' + p.value + ' (' + pct + '%)';
    }},
    series: [{
      type: 'funnel',
      left: '10%', right: '10%', top: 16, bottom: 16,
      width: '80%',
      sort: 'descending',
      gap: 4,
      label: { show: true, position: 'inside', color: '#fff', fontSize: 11, formatter: function(p) {
        const pct = funnelData[0].value > 0 ? Math.round((p.value / funnelData[0].value) * 100) : 0;
        return p.name + '\n' + p.value + ' (' + pct + '%)';
      }},
      itemStyle: { borderWidth: 0 },
      data: [
        { value: funnelData[0].value, name: 'Applied', itemStyle: { color: _cssColor('--accent') } },
        { value: funnelData[1].value, name: 'Screened', itemStyle: { color: '#06b6d4' } },
        { value: funnelData[2].value, name: 'Interview', itemStyle: { color: _cssColor('--green') } },
        { value: funnelData[3].value, name: 'Offer', itemStyle: { color: _cssColor('--warm') } }
      ]
    }]
  });
}

// Usage log table
function renderUsageLog(usage) {
  const body = $('#metrics-log-body');
  if (!body) return;

  if (!usage || usage.length === 0) {
    body.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-faint);">No applications tracked for this resume</td></tr>';
    return;
  }

  const search = $('#metrics-log-search');
  let filtered = usage;
  if (search && search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    filtered = usage.filter(u =>
      (u.company_name || '').toLowerCase().includes(q) ||
      (u.job_title || '').toLowerCase().includes(q)
    );
  }

  const stageBadge = (stage) => {
    const colors = { applied: '--accent', screened: '--green', interview: '--green', offer: '--warm', rejected: '--red' };
    const color = colors[stage] || '--text-faint';
    return `<span style="padding:2px 8px;border-radius:4px;background:var(${color})15;color:var(${color});font-size:10px;font-weight:600;">${(stage||'—').charAt(0).toUpperCase()+(stage||'').slice(1)}</span>`;
  };

  body.innerHTML = filtered.map(u => `<tr style="border-bottom:1px solid var(--border);">
    <td style="padding:8px 12px;color:var(--text);">${u.company_name || '—'}</td>
    <td style="padding:8px 12px;color:var(--text-dim);">${u.job_title || '—'}</td>
    <td style="padding:8px 12px;color:var(--text-dim);font-size:11px;">${formatMetricsDate(u.applied_at)}</td>
    <td style="padding:8px 12px;font-family:var(--mono);font-size:11px;color:var(--text-dim);">${u.match_score != null ? Math.round(u.match_score) + '%' : '—'}</td>
    <td style="padding:8px 12px;">${stageBadge(u.pipeline_stage)}</td>
  </tr>`).join('');
}

function formatMetricsDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Resize handler
window.addEventListener('resize', function() {
  Object.values(_metricsCharts).forEach(c => { try { c.resize(); } catch(e) { /* chart resize - expected */ } });
});

// Search filter for usage log
(function() {
  const el = document.getElementById('metrics-log-search');
  if (el) {
    let _t;
    el.addEventListener('input', function() {
      clearTimeout(_t);
      _t = setTimeout(function() { loadResumeMetrics(); }, 300);
    });
  }
})();

// Deep-link check
(function() {
  if (location.hash.includes('tab=resume') && location.hash.includes('intelligence')) {
    setTimeout(function() { switchStatsTab('resume'); }, 300);
  }
})();

// CS-P1-004 FE-005: Register resume-metrics exports with BJ namespace
(function() {
  ['loadResumeMetrics','switchStatsTab'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'resume-metrics', registered: Date.now() };
    }
  });
})();


// === js/overlay-analytics.js ===
// === js/overlay-analytics.js ===
// Overlay Pipeline S9: overlay_analytics sub-page
// Reads from overlay_analytics table via PostgREST (anon key, RLS-scoped to current user)
// Renders inside Stats page as a third tab: "Overlay Analytics"
// v7.04

var _oaCharts = {};
var _oaInitialized = false;

// ── Tab integration ──────────────────────────────────────────────────────────
// Extends switchStatsTab to support 'overlay' tab
(function() {
  var _origSwitch = window.switchStatsTab;
  window.switchStatsTab = function(tab) {
    var overlayContent = document.getElementById('stats-tab-content-overlay');
    var overlayBtn = document.getElementById('stats-tab-overlay');

    if (tab === 'overlay') {
      // Hide market + resume content
      var marketContent = document.getElementById('stats-tab-content-market');
      var resumeContent = document.getElementById('stats-tab-content-resume');
      if (marketContent) marketContent.style.display = 'none';
      if (resumeContent) resumeContent.style.display = 'none';
      document.querySelectorAll('.stats-tab-toggle').forEach(function(b) {
        b.classList.remove('active');
      });
      if (overlayContent) overlayContent.style.display = '';
      if (overlayBtn) overlayBtn.classList.add('active');
      initOverlayAnalyticsTab();
      return;
    }

    // For market/resume: hide overlay tab
    if (overlayContent) overlayContent.style.display = 'none';
    if (overlayBtn) overlayBtn.classList.remove('active');

    if (_origSwitch) _origSwitch(tab);
  };
})();

// ── Init ─────────────────────────────────────────────────────────────────────
function initOverlayAnalyticsTab() {
  if (_oaInitialized) { _oaRefreshCharts(); return; }
  _oaInitialized = true;
  _oaLoadData();
}

// ── Data fetch ───────────────────────────────────────────────────────────────
function _oaLoadData() {
  var userId = window._currentUserId || (window.sb && window.sb.auth && window.sb.auth.getSession && null);
  var anonKey = window.SUPABASE_ANON_KEY || window._sbAnonKey || '';
  var sbUrl = window.SUPABASE_URL || window._sbUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co';

  // Show loading state
  var container = document.getElementById('oa-charts-grid');
  if (container) container.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-faint);font-size:13px;">Loading overlay analytics…</div>';

  // Fetch last 30 days of events via PostgREST (RLS filters to current user)
  var since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  var url = sbUrl + '/rest/v1/overlay_analytics?select=action_type,source_platform,created_at,meta&created_at=gte.' + since + '&order=created_at.asc&limit=5000';

  fetch(url, {
    headers: {
      'apikey': anonKey,
      'Authorization': 'Bearer ' + (window._sbAccessToken || anonKey),
      'Content-Type': 'application/json',
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
      _oaRenderEmpty();
      return;
    }
    _oaRender(rows);
  })
  .catch(function(err) {
    console.warn('[BJ] overlay-analytics fetch error:', err);
    _oaRenderEmpty('Could not load data.');
  });
}

// ── Render ───────────────────────────────────────────────────────────────────
function _oaRender(rows) {
  // --- Aggregate ---
  var byAction = {};
  var byPlatform = {};
  var byDay = {};
  var funnelOrder = ['result_viewed','save_completed','stage_changed','picker_opened','match_score_viewed'];

  rows.forEach(function(r) {
    var a = r.action_type || 'unknown';
    byAction[a] = (byAction[a] || 0) + 1;

    var p = r.source_platform || 'unknown';
    byPlatform[p] = (byPlatform[p] || 0) + 1;

    var day = (r.created_at || '').substring(0, 10);
    if (day) {
      if (!byDay[day]) byDay[day] = {};
      byDay[day][a] = (byDay[day][a] || 0) + 1;
    }
  });

  // --- Stat cards ---
  var totalEvents = rows.length;
  var totalSaves = byAction['save_completed'] || 0;
  var totalViews = byAction['result_viewed'] || 0;
  var saveRate = totalViews > 0 ? Math.round((totalSaves / totalViews) * 100) : 0;
  var totalStageChanges = byAction['stage_changed'] || 0;

  var cardsEl = document.getElementById('oa-stat-cards');
  if (cardsEl) {
    cardsEl.innerHTML =
      '<div class="stat-card"><div class="stat-val" style="color:var(--accent)">' + totalEvents + '</div><div class="stat-label">Total Events (30d)</div></div>' +
      '<div class="stat-card"><div class="stat-val">' + totalViews + '</div><div class="stat-label">Job Pages Viewed</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:#22c55e">' + totalSaves + '</div><div class="stat-label">Jobs Saved</div></div>' +
      '<div class="stat-card"><div class="stat-val">' + saveRate + '%</div><div class="stat-label">View→Save Rate</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:#a855f7">' + totalStageChanges + '</div><div class="stat-label">Stage Advances</div></div>';
  }

  // S10: Drill-down link to Pipeline Overlay tab
  var drilldownEl = document.getElementById('oa-drilldown-link');
  if (drilldownEl) {
    drilldownEl.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="if(typeof drillDownToOverlayPipeline===\'function\')drillDownToOverlayPipeline()" style="font-size:11px;margin-bottom:4px;">View Overlay Pipeline Entries →</button>';
  }

  // --- Build charts container ---
  var container = document.getElementById('oa-charts-grid');
  if (!container) return;
  container.innerHTML =
    '<div class="stats-chart-card full"><div class="stats-chart-title">Event Volume Over Time</div><div class="ec" id="oa-chart-timeline" style="width:100%;height:280px;"></div></div>' +
    '<div class="stats-chart-card"><div class="stats-chart-title">Action Funnel</div><div class="ec" id="oa-chart-funnel" style="width:100%;height:300px;"></div></div>' +
    '<div class="stats-chart-card"><div class="stats-chart-title">Events by Platform</div><div class="ec" id="oa-chart-platform" style="width:100%;height:300px;"></div></div>';

  // Give DOM a tick to settle
  setTimeout(function() { _oaRenderCharts(byAction, byPlatform, byDay, funnelOrder); }, 50);
}

function _oaRenderCharts(byAction, byPlatform, byDay, funnelOrder) {
  if (typeof echarts === 'undefined') return;

  var COLORS = ['#6366f1','#22c55e','#f59e0b','#ec4899','#06b6d4','#a855f7'];
  var tooltipStyle = { backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } };
  var axisLabel = { color: 'hsl(228,11%,41%)', fontFamily: 'JetBrains Mono', fontSize: 10 };

  // --- Timeline chart ---
  var days = Object.keys(byDay).sort();
  var actionTypes = Object.keys(byAction);
  var timelineEl = document.getElementById('oa-chart-timeline');
  if (timelineEl) {
    var tc = _oaCharts['timeline'];
    if (!tc || tc.isDisposed()) tc = echarts.init(timelineEl);
    _oaCharts['timeline'] = tc;
    tc.setOption({
      tooltip: Object.assign({ trigger: 'axis', axisPointer: { type: 'shadow' } }, tooltipStyle),
      legend: { data: actionTypes, bottom: 0, textStyle: { color: 'hsl(228,11%,41%)', fontSize: 10, fontFamily: 'Outfit' } },
      grid: { top: 20, bottom: 60, left: 40, right: 20, containLabel: true },
      xAxis: { type: 'category', data: days, axisLabel: axisLabel, axisLine: { lineStyle: { color: 'hsl(228,16%,91%)' } } },
      yAxis: { type: 'value', axisLabel: axisLabel, splitLine: { lineStyle: { color: 'hsl(228,16%,93%)' } } },
      series: actionTypes.map(function(a, i) {
        return {
          name: a,
          type: 'bar',
          stack: 'total',
          data: days.map(function(d) { return (byDay[d] && byDay[d][a]) || 0; }),
          itemStyle: { color: COLORS[i % COLORS.length] }
        };
      })
    });
  }

  // --- Funnel chart ---
  var funnelEl = document.getElementById('oa-chart-funnel');
  if (funnelEl) {
    var fc = _oaCharts['funnel'];
    if (!fc || fc.isDisposed()) fc = echarts.init(funnelEl);
    _oaCharts['funnel'] = fc;
    var funnelData = funnelOrder.map(function(a) {
      return { name: a.replace(/_/g,' '), value: byAction[a] || 0 };
    }).filter(function(d) { return d.value > 0; });
    fc.setOption({
      tooltip: Object.assign({ trigger: 'item', formatter: '{b}: {c}' }, tooltipStyle),
      series: [{
        type: 'funnel',
        left: '10%', width: '80%',
        sort: 'none',
        data: funnelData,
        label: { position: 'inside', color: '#fff', fontFamily: 'JetBrains Mono', fontSize: 11 },
        itemStyle: { borderWidth: 0 },
        color: COLORS
      }]
    });
  }

  // --- Platform chart ---
  var platEl = document.getElementById('oa-chart-platform');
  if (platEl) {
    var pc = _oaCharts['platform'];
    if (!pc || pc.isDisposed()) pc = echarts.init(platEl);
    _oaCharts['platform'] = pc;
    var platData = Object.keys(byPlatform).map(function(p) {
      return { name: p, value: byPlatform[p] };
    }).sort(function(a,b) { return b.value - a.value; });
    pc.setOption({
      tooltip: Object.assign({ trigger: 'item', formatter: '{b}: {c} ({d}%)' }, tooltipStyle),
      series: [{
        type: 'pie',
        radius: ['40%','70%'],
        data: platData,
        label: { color: 'hsl(228,11%,41%)', fontFamily: 'Outfit', fontSize: 11 },
        color: COLORS
      }]
    });
  }
}

function _oaRefreshCharts() {
  _oaLoadData();
}

function _oaRenderEmpty(msg) {
  var container = document.getElementById('oa-charts-grid');
  if (container) container.innerHTML = '<div style="padding:48px 20px;text-align:center;color:var(--text-faint);font-size:13px;">' + (msg || 'No overlay analytics data yet. Install the extension and browse some jobs to get started.') + '</div>';
  var cardsEl = document.getElementById('oa-stat-cards');
  if (cardsEl) cardsEl.innerHTML = '';
}

// Resize handler
window.addEventListener('resize', function() {
  Object.values(_oaCharts).forEach(function(c) { if (c && !c.isDisposed()) c.resize(); });
});


// CS-P1-004 FE-005: Register overlay-analytics exports with BJ namespace
(function() {
  ['switchStatsTab'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'overlay-analytics', registered: Date.now() };
    }
  });
})();


// === js/chat.js ===
// ============================================================
// CHAT MODE — Conversational Job Search (Session 5)
// Toggle between Filters and Chat on Jobs Feed + Bidirectional Sync + Saved Prompts
// Wires to chat-job-search, filter-to-prompt, prompt-to-filter Edge Functions
// Saved prompts: Save/Load with Supabase persistence + derived_filters auto-update
// Session 5: System Integration — prompts as first-class filters, notifications, auto-apply, match %
// ============================================================

// --- State ---
var _chatMode = false;
var _chatMessages = []; // { role: 'user'|'assistant', content: string, filters?: object }
var _chatSending = false;
var _chatRateLimit = { remaining: null, resetAt: null };
var _chatMessageCap = 20;
var _chatSyncInProgress = false;
var _chatLastSyncedFilterHash = null;

// Off-topic blocklist (Layer 1 client-side protection)
var _chatBlockedPatterns = [
  /write\s+(me\s+)?(a\s+)?(poem|story|essay|song|code|script)/i,
  /ignore\s+(previous|all|above)\s+(instructions|prompts)/i,
  /you\s+are\s+(now|a)\s/i,
  /pretend\s+(to\s+be|you)/i,
  /act\s+as\s+(a|an)\s/i,
  /what\s+is\s+the\s+meaning\s+of\s+life/i,
  /tell\s+me\s+(a\s+)?joke/i,
  /translate\s+.+\s+to\s/i,
  /system\s*prompt/i,
  /<\/?[a-z]+>/i,  // HTML injection
  // Session 6: Enhanced injection hardening (10 adversarial vectors)
  /\bDAN\b.*\bmode\b/i,                    // DAN jailbreak
  /do\s+anything\s+now/i,                   // DAN variant
  /forget\s+(everything|your|all)/i,        // Memory wipe attacks
  /new\s+instructions?\s*:/i,               // Instruction override
  /\[system\]|\[INST\]|\<\|im_start\|/i,   // Token injection
  /base64|atob|eval\s*\(/i,                 // Code injection
  /\brepeat\s+(after|back|everything)/i,    // Prompt extraction
  /what\s+(were|are)\s+your\s+(instructions|rules|prompt)/i, // Prompt leak
  /\broleplay\b|\bcharacter\b.*\bplay\b/i,  // Roleplay jailbreak
  /reveal\s+(your|the)\s+(system|initial|original)/i, // System prompt extraction
];

// --- Rate limit tiers ---
var _chatLimits = {
  free:    { perConvo: 10, perDay: 30 },
  starter: { perConvo: 30, perDay: 100 },
  pro:     { perConvo: 100, perDay: 500 }
};

// --- ChatSession class ---
function ChatSession() {
  this.messages = [];
  this.messageCount = 0;
}

ChatSession.prototype.addMessage = function(role, content, filters) {
  this.messages.push({ role: role, content: content, filters: filters || null, ts: Date.now() });
  if (role === 'user') this.messageCount++;
  // Cap at 20 messages (10 user + 10 assistant) for context window
  if (this.messages.length > _chatMessageCap) {
    this.messages = this.messages.slice(-_chatMessageCap);
  }
};

ChatSession.prototype.getHistory = function() {
  return this.messages.map(function(m) {
    return { role: m.role, content: m.content };
  });
};

ChatSession.prototype.clear = function() {
  this.messages = [];
  this.messageCount = 0;
};

var _chatSession = new ChatSession();

// --- Mode Toggle ---
function initChatMode() {
  var toggle = document.getElementById('search-mode-toggle');
  if (!toggle) return;

  var filtersBtn = toggle.querySelector('[data-mode="filters"]');
  var chatBtn = toggle.querySelector('[data-mode="chat"]');

  if (filtersBtn) filtersBtn.addEventListener('click', function() { setSearchMode('filters'); });
  if (chatBtn) chatBtn.addEventListener('click', function() { setSearchMode('chat'); });

  // Init chat input handlers
  var chatInput = document.getElementById('chat-input');
  var chatSendBtn = document.getElementById('chat-send-btn');

  if (chatInput) {
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    // Auto-resize textarea + track user edits to auto-generated prompts
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      // Track if user modified an auto-generated prompt
      if (this.getAttribute('data-auto-generated') === 'true') {
        this.setAttribute('data-auto-generated', 'modified');
        if (window.posthog) {
          try { posthog.capture('chat_prompt_modified'); } catch(e) { reportError('chat:chat', e); }
        }
      }
    });
  }
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }

  // Init saved prompts (Session 4)
  initSavedPrompts();

  // Session 11: Onboarding tooltip for chat mode toggle
  // Shows once per user, dismissed on click or after first chat toggle
  if (!localStorage.getItem('bj_chat_tooltip_dismissed')) {
    var chatBtn = toggle.querySelector('[data-mode="chat"]');
    if (chatBtn) {
      var tooltip = document.createElement('div');
      tooltip.id = 'chat-onboarding-tooltip';
      tooltip.className = 'chat-onboarding-tooltip';
      tooltip.innerHTML = '<span class="tooltip-arrow"></span>' +
        '<strong>New: Chat Search</strong><br>' +
        'Describe what you\'re looking for in plain English and we\'ll find matching jobs.' +
        '<button class="tooltip-dismiss" aria-label="Dismiss">Got it</button>';
      tooltip.style.cssText = 'position:absolute;top:calc(100% + 8px);right:0;z-index:1000;' +
        'background:#1a1a2e;color:#fff;padding:12px 16px;border-radius:8px;font-size:13px;' +
        'line-height:1.4;width:240px;box-shadow:0 4px 16px rgba(0,0,0,0.2);';
      // Arrow style
      var arrowStyle = document.createElement('style');
      arrowStyle.textContent = '.chat-onboarding-tooltip .tooltip-arrow{position:absolute;top:-6px;right:24px;' +
        'width:12px;height:12px;background:#1a1a2e;transform:rotate(45deg);}' +
        '.chat-onboarding-tooltip .tooltip-dismiss{display:block;margin-top:8px;padding:4px 12px;' +
        'background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;}' +
        '.chat-onboarding-tooltip .tooltip-dismiss:hover{background:rgba(255,255,255,0.25);}';
      document.head.appendChild(arrowStyle);

      // Position relative to toggle
      toggle.style.position = 'relative';
      toggle.appendChild(tooltip);

      var dismissTooltip = function() {
        if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
        localStorage.setItem('bj_chat_tooltip_dismissed', '1');
      };
      tooltip.querySelector('.tooltip-dismiss').addEventListener('click', dismissTooltip);
      // Also dismiss on first toggle to chat
      chatBtn.addEventListener('click', dismissTooltip, { once: true });
      // Auto-dismiss after 10 seconds
      setTimeout(function() {
        if (tooltip.parentNode) dismissTooltip();
      }, 10000);

      // PostHog: track tooltip impression and dismissal
      if (window.posthog) {
        try { posthog.capture('chat_onboarding_tooltip_shown'); } catch(e) { reportError('chat:chat', e); }
        tooltip.querySelector('.tooltip-dismiss').addEventListener('click', function() {
          try { posthog.capture('chat_onboarding_tooltip_dismissed', { method: 'button' }); } catch(e) { reportError('chat:chat', e); }
        });
      }
    }
  }

  // Clear chat button
  var clearBtn = document.getElementById('chat-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      // Track if user scrapped an auto-generated prompt
      var chatInput = document.getElementById('chat-input');
      if (chatInput && chatInput.getAttribute('data-auto-generated')) {
        chatInput.removeAttribute('data-auto-generated');
        if (window.posthog) {
          try { posthog.capture('chat_prompt_scrapped'); } catch(e) { reportError('chat:chat', e); }
        }
      }
      _chatSession.clear();
      _chatMessages = [];
      _chatLastSyncedFilterHash = null;
      _currentPromptId = null;
      renderChatMessages();
      updateChatCounter();
      updateLoadedPromptIndicator();
      // Hide sync banner if visible
      var syncBanner = document.getElementById('chat-sync-banner');
      if (syncBanner) syncBanner.style.display = 'none';
      // QA-FIX: Hide inline save row on clear
      var saveRow = document.getElementById('save-prompt-row');
      if (saveRow) saveRow.classList.add('u-hidden');
    });
  }
}

function setSearchMode(mode) {
  var prevMode = _chatMode ? 'chat' : 'filters';
  _chatMode = (mode === 'chat');

  var toggle = document.getElementById('search-mode-toggle');
  if (!toggle) return;

  var filtersBtn = toggle.querySelector('[data-mode="filters"]');
  var chatBtn = toggle.querySelector('[data-mode="chat"]');

  // Update toggle state
  if (filtersBtn) filtersBtn.classList.toggle('active', !_chatMode);
  if (chatBtn) chatBtn.classList.toggle('active', _chatMode);

  // GS-SETUP-V2: Update AI CTA label for current mode
  var aiCtaTitle = document.getElementById('ai-cta-title');
  var aiCtaSub = document.getElementById('ai-cta-sub');
  if (aiCtaTitle) aiCtaTitle.textContent = _chatMode ? 'Generate prompt from your resume' : 'Generate filters from your resume';
  if (aiCtaSub) aiCtaSub.textContent = _chatMode
    ? 'AI reads your resume and creates a natural language search prompt automatically'
    : 'AI reads your resume and creates keyword, location, and level filters automatically';

  // Crossfade panels
  var filterPanel = document.getElementById('filter-panel-wrap');
  var chatPanel = document.getElementById('chat-panel');

  if (filterPanel && chatPanel) {
    if (_chatMode) {
      filterPanel.style.opacity = '0';
      filterPanel.style.pointerEvents = 'none';
      setTimeout(function() {
        filterPanel.style.display = 'none';
        chatPanel.style.display = 'flex';
        requestAnimationFrame(function() {
          chatPanel.style.opacity = '1';
          chatPanel.style.pointerEvents = 'auto';
        });
        // QA-FIX: Keep saved searches visible in chat mode
        // They're inside filter-panel-wrap so we clone/move them temporarily
        var sfToggle = document.getElementById('sf-toggle');
        var sfBody = document.getElementById('sf-collapse-body');
        if (sfToggle) sfToggle.style.cssText = 'display:flex !important';
        if (sfBody) sfBody.style.cssText = 'display:block !important';
        // Re-show the filter-panel-wrap but only the saved searches part
        filterPanel.style.display = 'block';
        // Hide everything except saved searches inside filter-panel-wrap
        Array.from(filterPanel.children).forEach(function(child) {
          if (child.id === 'sf-toggle' || child.id === 'sf-collapse-body') {
            child.style.display = '';
          } else if (child.classList && child.classList.contains('sf-collapse-header')) {
            child.style.display = '';
          } else {
            child.style.display = 'none';
          }
        });
        filterPanel.style.opacity = '1';
        filterPanel.style.pointerEvents = 'auto';

        var chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.focus();
      }, 200);

      // --- Filter→Chat sync: pre-fill chat input from active filters ---
      if (prevMode === 'filters') {
        syncFilterToChat();
      }
    } else {
      chatPanel.style.opacity = '0';
      chatPanel.style.pointerEvents = 'none';
      setTimeout(function() {
        chatPanel.style.display = 'none';
        // QA-FIX: Restore all filter-panel-wrap children when switching back
        Array.from(filterPanel.children).forEach(function(child) {
          child.style.display = '';
        });
        filterPanel.style.display = 'block';
        requestAnimationFrame(function() {
          filterPanel.style.opacity = '1';
          filterPanel.style.pointerEvents = 'auto';
        });
      }, 200);

      // --- Chat→Filter sync: extract filters from conversation ---
      if (prevMode === 'chat') {
        syncChatToFilter();
      }
    }
  }

  // PostHog event
  if (window.posthog) {
    try { posthog.capture('chat_mode_toggled', { mode: mode }); } catch(e) { reportError('chat:chat', e); }
  }
}


// --- Bidirectional Sync (Session 3) ---

// Collect current builder pill state into a filter object for the Edge Function
function _collectBuilderFilters() {
  var filters = {};
  // Read pill arrays from global scope (query-builder.js exports these)
  if (typeof whatPills !== 'undefined' && whatPills.length) {
    filters.what_pills = [];
    whatPills.forEach(function(p) { filters.what_pills = filters.what_pills.concat(p.values); });
  }
  if (typeof wherePills !== 'undefined' && wherePills.length) {
    filters.where_pills = [];
    wherePills.forEach(function(p) { filters.where_pills = filters.where_pills.concat(p.values); });
  }
  if (typeof whoPills !== 'undefined' && whoPills.length) {
    filters.who_pills = [];
    whoPills.forEach(function(p) { filters.who_pills = filters.who_pills.concat(p.values); });
  }
  if (typeof whatNotPills !== 'undefined' && whatNotPills.length) {
    filters.not_pills = [];
    whatNotPills.forEach(function(p) { filters.not_pills = filters.not_pills.concat(p.values); });
  }
  // Type pills from whenPills that are workplace types
  if (typeof whenPills !== 'undefined' && whenPills.length) {
    filters.type_pills = [];
    whenPills.forEach(function(p) { filters.type_pills = filters.type_pills.concat(p.values); });
  }
  // Salary from payPills
  if (typeof payPills !== 'undefined' && payPills.length) {
    payPills.forEach(function(p) {
      p.values.forEach(function(v) {
        var clean = v.replace(/[^0-9kK+\-]/g, '').toLowerCase();
        var num = parseInt(clean.replace('k', '000'));
        if (!isNaN(num)) {
          if (v.indexOf('+') >= 0 || v.indexOf('min') >= 0) {
            filters.salary_min = num;
          } else {
            // If we already have a min, this is likely max
            if (filters.salary_min) {
              filters.salary_max = num;
            } else {
              filters.salary_min = num;
            }
          }
        }
      });
    });
  }
  return filters;
}

// Hash filter object to detect changes (avoid redundant syncs)
function _hashFilters(filters) {
  try { return JSON.stringify(filters); } catch(e) { return ''; }
}

// Filter→Chat: On toggle to Chat with active filters, call filter-to-prompt and pre-fill input
async function syncFilterToChat() {
  if (_chatSyncInProgress) return;
  if (_chatSession.messages.length > 0) return; // Don't overwrite active conversation

  var filters = _collectBuilderFilters();
  var hash = _hashFilters(filters);
  if (!filters || Object.keys(filters).length === 0) return; // No active filters
  if (hash === _chatLastSyncedFilterHash) return; // Already synced these exact filters

  _chatSyncInProgress = true;
  var chatInput = document.getElementById('chat-input');

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { _chatSyncInProgress = false; return; }

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/filter-to-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ filters: filters })
    });

    if (!resp.ok) {
      console.warn('[BJ] filter-to-prompt failed:', resp.status);
      _chatSyncInProgress = false;
      return;
    }

    var data = await resp.json();
    var prompt = (data.prompt || '').trim();

    if (prompt && chatInput) {
      chatInput.value = prompt;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
      chatInput.setAttribute('data-auto-generated', 'true');
      _chatLastSyncedFilterHash = hash;

      // Show subtle hint that this was auto-generated
      var banner = document.getElementById('chat-filter-banner');
      if (banner) {
        banner.innerHTML = '<i data-lucide="filter" class="icon-xs icon-stroke" style="flex-shrink:0;"></i>' +
          '<span>Pre-filled from your active filters — edit or send as-is</span>';
        banner.style.display = 'flex';
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
        // Auto-hide after 6s
        setTimeout(function() { banner.style.display = 'none'; }, 6000);
      }

      // PostHog event
      if (window.posthog) {
        try { posthog.capture('chat_prompt_auto_generated', { filter_count: Object.keys(filters).length, fallback: !!data.fallback }); } catch(e) { reportError('chat:chat', e); }
      }
    }
  } catch(err) { reportError('chat', err); console.error('[BJ] Filter→Chat sync error:', err);
  }

  _chatSyncInProgress = false;
}

// Chat→Filter: On toggle to Filters with conversation, call prompt-to-filter and populate pills
async function syncChatToFilter() {
  if (_chatSyncInProgress) return;
  if (_chatSession.messages.length === 0) return; // No conversation to extract from

  _chatSyncInProgress = true;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { _chatSyncInProgress = false; return; }

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/prompt-to-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ conversation: _chatSession.getHistory() })
    });

    if (!resp.ok) {
      console.warn('[BJ] prompt-to-filter failed:', resp.status);
      _chatSyncInProgress = false;
      return;
    }

    var data = await resp.json();
    var filters = data.filters;

    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
      // Partial extraction or empty — no pills to populate
      if (data.parse_error) {
        console.warn('[BJ] prompt-to-filter parse error');
      }
      _chatSyncInProgress = false;
      return;
    }

    // Show confirmation banner before populating pills
    _showSyncConfirmation(filters);

  } catch(err) { reportError('chat', err); console.error('[BJ] Chat→Filter sync error:', err);
  }

  _chatSyncInProgress = false;
}

// Show a confirmation banner with extracted filters, user can Accept or Dismiss
function _showSyncConfirmation(filters) {
  var banner = document.getElementById('chat-sync-banner');
  if (!banner) return;

  // Build summary of what was extracted
  var parts = [];
  if (filters.what_pills && filters.what_pills.length) parts.push(filters.what_pills.length + ' role' + (filters.what_pills.length > 1 ? 's' : ''));
  if (filters.where_pills && filters.where_pills.length) parts.push(filters.where_pills.length + ' location' + (filters.where_pills.length > 1 ? 's' : ''));
  if (filters.who_pills && filters.who_pills.length) parts.push(filters.who_pills.length + ' compan' + (filters.who_pills.length > 1 ? 'ies' : 'y'));
  if (filters.not_pills && filters.not_pills.length) parts.push(filters.not_pills.length + ' exclusion' + (filters.not_pills.length > 1 ? 's' : ''));
  if (filters.type_pills && filters.type_pills.length) parts.push(filters.type_pills.join(', '));
  if (filters.salary_min || filters.salary_max) parts.push('salary range');
  if (filters.additional_context) parts.push('preferences');

  if (parts.length === 0) { banner.style.display = 'none'; return; }

  var summary = parts.join(', ');

  banner.innerHTML = '<div class="chat-sync-msg">' +
    '<i data-lucide="message-square" class="icon-sm icon-stroke" style="flex-shrink:0;"></i>' +
    '<span>Extracted from chat: ' + escapeHtml(summary) + '</span>' +
    '</div>' +
    '<div class="chat-sync-actions">' +
    '<button class="chat-sync-accept" id="chat-sync-accept">Apply to filters</button>' +
    '<button class="chat-sync-dismiss" id="chat-sync-dismiss">Dismiss</button>' +
    '</div>';
  banner.style.display = 'flex';
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  // Bind accept
  document.getElementById('chat-sync-accept').addEventListener('click', function() {
    _applySyncedFilters(filters);
    banner.style.display = 'none';
    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_to_filter_sync', { action: 'accepted', filter_count: Object.keys(filters).length }); } catch(e) { reportError('chat:chat', e); }
    }
  });

  // Bind dismiss
  document.getElementById('chat-sync-dismiss').addEventListener('click', function() {
    banner.style.display = 'none';
    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_to_filter_sync', { action: 'dismissed' }); } catch(e) { reportError('chat:chat', e); }
    }
  });
}

// Apply extracted filters from chat to the pill system
function _applySyncedFilters(filters) {
  // Clear existing builder pills before applying new ones
  // We use the global pill arrays + renderAllPills from query-builder.js

  if (filters.what_pills && filters.what_pills.length) {
    if (typeof whatPills !== 'undefined') {
      // Reset what pills, add new ones
      whatPills.length = 0;
      filters.what_pills.forEach(function(v) {
        whatPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.where_pills && filters.where_pills.length) {
    if (typeof wherePills !== 'undefined') {
      wherePills.length = 0;
      filters.where_pills.forEach(function(v) {
        wherePills.push({ values: [v], type: 'location' });
      });
    }
  }

  if (filters.who_pills && filters.who_pills.length) {
    if (typeof whoPills !== 'undefined') {
      whoPills.length = 0;
      filters.who_pills.forEach(function(v) {
        whoPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.not_pills && filters.not_pills.length) {
    if (typeof whatNotPills !== 'undefined') {
      whatNotPills.length = 0;
      filters.not_pills.forEach(function(v) {
        whatNotPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.salary_min || filters.salary_max) {
    if (typeof payPills !== 'undefined') {
      payPills.length = 0;
      if (filters.salary_min && filters.salary_max) {
        var minK = Math.round(filters.salary_min / 1000);
        var maxK = Math.round(filters.salary_max / 1000);
        payPills.push({ values: ['$' + minK + 'k-$' + maxK + 'k'], type: 'salary' });
      } else if (filters.salary_min) {
        var minK = Math.round(filters.salary_min / 1000);
        payPills.push({ values: ['$' + minK + 'k+'], type: 'salary' });
      } else if (filters.salary_max) {
        var maxK = Math.round(filters.salary_max / 1000);
        payPills.push({ values: ['<$' + maxK + 'k'], type: 'salary' });
      }
    }
  }

  // Render all pills visually
  if (typeof renderAllPills === 'function') {
    renderAllPills();
  }

  // Trigger job feed refresh
  // PostHog: chat_filters_applied
  if (window.posthog) {
    try { posthog.capture('chat_filters_applied', { filter_count: Object.keys(filters).length }); } catch(e) { reportError('chat:chat', e); }
  }

  if (typeof debouncedSearchJobs === 'function') {
    debouncedSearchJobs();
  }

  // Show toast confirmation
  if (typeof showToast === 'function') {
    showToast('Chat filters applied to search', 'success');
  }
}

// --- Send message ---
async function sendChatMessage() {
  if (_chatSending) return;

  var chatInput = document.getElementById('chat-input');
  if (!chatInput) return;

  var text = chatInput.value.trim();
  if (!text) return;

  // Client-side off-topic check (Layer 1)
  for (var i = 0; i < _chatBlockedPatterns.length; i++) {
    if (_chatBlockedPatterns[i].test(text)) {
      appendChatBubble('assistant', 'I can only help with job search queries. Try describing the kind of role, location, company, or salary range you\'re looking for.');
      chatInput.value = '';
      chatInput.style.height = 'auto';
      return;
    }
  }

  // Check message cap
  if (_chatSession.messageCount >= _chatMessageCap / 2) {
    appendChatBubble('assistant', 'You\'ve reached the conversation limit (' + (_chatMessageCap / 2) + ' messages). Clear the conversation to start fresh.');
    return;
  }

  // Clear input and auto-generated flag
  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatInput.removeAttribute('data-auto-generated');

  // Add user message
  _chatSession.addMessage('user', text);
  appendChatBubble('user', text);

  // PostHog: chat_message_sent
  if (window.posthog) {
    try { posthog.capture('chat_message_sent', { tier: getUserTier(), msg_count: _chatSession.messageCount, has_filters: !!window._chatFilterOverride }); } catch(e) { reportError('chat:chat', e); }
  }
  updateChatCounter();

  // Show typing indicator
  showTypingIndicator(true);
  _chatSending = true;

  // Session 6: Visual sending state on button
  var sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) sendBtn.classList.add('sending');

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) {
      showTypingIndicator(false);
      appendChatBubble('assistant', 'Please sign in to use chat search.');
      _chatSending = false;
      return;
    }

    var token = session.data.session.access_token;
    var _chatFetchStart = performance.now();
    var resp = await fetch(SUPABASE_URL + '/functions/v1/chat-job-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        messages: _chatSession.getHistory(),
        tier: getUserTier()
      })
    });
    var _chatLatencyMs = Math.round(performance.now() - _chatFetchStart);

    showTypingIndicator(false);

    // Session 11: PostHog latency tracking for Edge Function performance monitoring
    if (window.posthog) {
      try {
        posthog.capture('chat_edge_function_latency', {
          latency_ms: _chatLatencyMs,
          status: resp.status,
          tier: getUserTier(),
          message_count: _chatSession.messages.length,
          p95_target_ms: 2000
        });
      } catch(e) { reportError('chat:chat', e); }
    }
    if (_chatLatencyMs > 2000) {
      console.warn('[BJ] Chat edge function slow: ' + _chatLatencyMs + 'ms (p95 target: 2000ms)');
    }

    if (resp.status === 429) {
      var rateLimitData = null;
      try { rateLimitData = await resp.json(); } catch(e) { reportError('chat:chat', e); }
      showChatRateLimit(rateLimitData);
      _chatSending = false;
      return;
    }

    if (!resp.ok) {
      var errText = '';
      try { var errJ = await resp.json(); errText = errJ.error || errJ.message || ''; } catch(e) { reportError('chat:chat', e); }
      appendChatBubble('assistant', 'Something went wrong. ' + (errText || 'Please try again.'));
      _chatSending = false;
      return;
    }

    var data = await resp.json();

    // POST-REM: Track cache hit in PostHog latency event (supplements initial latency capture)
    if (data.cache_hit && window.posthog) {
      try { posthog.capture('chat_edge_function_latency', { latency_ms: _chatLatencyMs, cache_hit: true, tier: getUserTier() }); } catch(e) { reportError('chat:chat', e); }
    }

    // Extract response text and filters
    var assistantText = data.response || data.text || '';
    var extractedFilters = data.filters || null;

    // PostHog: chat_filters_extracted
    if (extractedFilters && Object.keys(extractedFilters).length > 0 && window.posthog) {
      try { posthog.capture('chat_filters_extracted', { filter_count: Object.keys(extractedFilters).length, keywords: (extractedFilters.keywords || []).join(',') }); } catch(e) { reportError('chat:chat', e); }
    }

    // Add assistant message
    _chatSession.addMessage('assistant', assistantText, extractedFilters);
    appendChatBubble('assistant', assistantText);

    // Update rate limit display
    if (data.remaining !== undefined) {
      _chatRateLimit.remaining = data.remaining;
      updateChatRateLimitDisplay();
    }

    // If filters were extracted, update the job feed
    if (extractedFilters && Object.keys(extractedFilters).length > 0) {
      applyChatFilters(extractedFilters);
    }

    // Session 4: Update derived_filters in saved prompt on every conversation update
    if (_currentPromptId) {
      updateDerivedFilters();
    }

  } catch (err) {
    showTypingIndicator(false);
    reportError('chat', err);
    console.error('[BJ] Chat error:', err);
    appendChatBubble('assistant', 'Connection error. Please check your network and try again.');
  }

  _chatSending = false;

  // QA-FIX: Show inline save prompt row once there's a conversation
  var savePromptRow = document.getElementById('save-prompt-row');
  if (savePromptRow && _chatSession.messages.length > 0 && !_currentPromptId) {
    savePromptRow.classList.remove('u-hidden');
  }

  // Session 6: Remove sending state
  var sendBtnEnd = document.getElementById('chat-send-btn');
  if (sendBtnEnd) sendBtnEnd.classList.remove('sending');
}

// --- Apply extracted filters to job feed ---
function applyChatFilters(filters) {
  // The Edge Function extracts structured filters like:
  // { keywords: [...], locations: [...], salary_min: N, salary_max: N, level: '...', remote: bool }
  // We trigger a fresh job feed query with these params
  console.log('[BJ] Chat extracted filters:', JSON.stringify(filters));

  // Show a subtle banner that filters were applied
  var banner = document.getElementById('chat-filter-banner');
  if (banner) {
    var count = 0;
    if (filters.keywords) count += filters.keywords.length;
    if (filters.locations) count += filters.locations.length;
    if (filters.level) count++;
    if (filters.remote) count++;
    if (filters.salary_min || filters.salary_max) count++;

    banner.innerHTML = '<i data-lucide="filter" class="icon-xs icon-stroke" style="flex-shrink:0;"></i> ' +
      '<span>' + count + ' filter' + (count !== 1 ? 's' : '') + ' extracted from conversation</span>';
    banner.style.display = 'flex';
    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    // Auto-hide after 5s
    setTimeout(function() { banner.style.display = 'none'; }, 5000);
  }

  // UX-001: Populate filter builder pills from chat-extracted filters
  // This ensures the same filters are visible in Filters mode and the save-filter-row shows
  if (typeof window.whatPills !== 'undefined') {
    // Clear existing pills before populating from chat
    window.whatPills.length = 0;
    window.wherePills.length = 0;
    window.whoPills.length = 0;
    window.payPills.length = 0;
    window.whatNotPills.length = 0;
    window.whereNotPills.length = 0;
    window.whoNotPills.length = 0;

    // Keywords → What pills
    if (filters.keywords && filters.keywords.length > 0) {
      filters.keywords.forEach(function(kw) {
        window.whatPills.push({ values: [kw], source: 'chat' });
      });
    }
    // Locations → Where pills
    if (filters.locations && filters.locations.length > 0) {
      filters.locations.forEach(function(loc) {
        window.wherePills.push({ values: [loc], locType: 'city', source: 'chat' });
      });
    }
    // Remote → Where pill
    if (filters.remote) {
      window.wherePills.push({ values: ['Remote'], locType: 'remote', source: 'chat' });
    }
    // Level → Level pill
    if (filters.level && typeof window.levelPills !== 'undefined') {
      window.levelPills.length = 0;
      window.levelPills.push({ values: [filters.level], source: 'chat' });
    }
    // Salary → Pay pill
    if (filters.salary_min || filters.salary_max) {
      window.payPills.push({
        values: [(filters.salary_min || 0) + '-' + (filters.salary_max || '')],
        min: filters.salary_min || 0,
        max: filters.salary_max || null,
        source: 'chat'
      });
    }
    // Companies → Who pills
    if (filters.companies && filters.companies.length > 0) {
      filters.companies.forEach(function(co) {
        window.whoPills.push({ values: [co], source: 'chat' });
      });
    }
    // Exclude companies → Who NOT pills
    if (filters.excludeCompanies && filters.excludeCompanies.length > 0) {
      filters.excludeCompanies.forEach(function(co) {
        window.whoNotPills.push({ values: [co], source: 'chat' });
      });
    }
    // Re-render pills in the filter builder (visible when user switches to Filters mode)
    if (typeof renderAllPills === 'function') {
      renderAllPills();
    }
  }

  // Build a temporary search config and trigger job feed refresh
  // This integrates with the existing searchJobs() pipeline
  if (typeof window._chatFilterOverride === 'undefined') {
    window._chatFilterOverride = null;
  }
  window._chatFilterOverride = filters;

  // Trigger refresh
  // PostHog: chat_filters_applied
  if (window.posthog) {
    try { posthog.capture('chat_filters_applied', { filter_count: Object.keys(filters).length }); } catch(e) { reportError('chat:chat', e); }
  }

  if (typeof debouncedSearchJobs === 'function') {
    debouncedSearchJobs();
  }
}

// --- UI Rendering ---
function appendChatBubble(role, text) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-' + role;

  if (role === 'assistant') {
    // Parse basic markdown-like formatting
    var html = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = html;
  } else {
    bubble.textContent = text;
  }

  container.appendChild(bubble);
  // POD3-LUCIDE: Re-initialize any Lucide icons in chat messages
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function renderChatMessages() {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = '';

  if (_chatSession.messages.length === 0) {
    container.innerHTML = '<div class="chat-empty">' +
      '<div class="chat-empty-icon"><i data-lucide="message-square" class="icon-xl icon-stroke-lg"></i></div>' +
      '<div class="chat-empty-title">Describe your ideal role</div>' +
      '<div class="chat-empty-sub">Try: "Senior product manager roles in Austin, TX paying over $150K" or "Remote React developer positions at mid-size companies"</div>' +
      '</div>';
    return;
  }

  _chatSession.messages.forEach(function(msg) {
    appendChatBubble(msg.role, msg.content);
  });
}

function showTypingIndicator(show) {
  var indicator = document.getElementById('chat-typing');
  if (indicator) {
    indicator.style.display = show ? 'flex' : 'none';
  }
  // Disable send button while typing
  var sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) sendBtn.disabled = show;
}

function updateChatCounter() {
  var counter = document.getElementById('chat-msg-counter');
  if (!counter) return;

  var used = _chatSession.messageCount;
  var tier = getUserTier();
  var limit = _chatLimits[tier] ? _chatLimits[tier].perConvo : _chatLimits.free.perConvo;

  counter.textContent = used + '/' + limit;
  counter.style.color = (used >= limit * 0.8) ? 'var(--warm)' : 'var(--text-faint)';
}

function updateChatRateLimitDisplay() {
  var el = document.getElementById('chat-remaining');
  if (!el) return;

  if (_chatRateLimit.remaining !== null) {
    el.textContent = _chatRateLimit.remaining + ' remaining today';
    el.style.display = 'inline';
    el.style.color = _chatRateLimit.remaining <= 5 ? 'var(--warm)' : 'var(--text-faint)';
  }
}

function showChatRateLimit(data) {
  var banner = document.getElementById('chat-rate-banner');
  if (!banner) return;

  var tier = getUserTier();
  var limit = _chatLimits[tier] ? _chatLimits[tier] : _chatLimits.free;
  var resetText = '';
  if (data && data.reset_at) {
    var resetDate = new Date(data.reset_at);
    var now = new Date();
    var diffMin = Math.ceil((resetDate - now) / 60000);
    if (diffMin > 0) {
      resetText = ' Resets in ' + (diffMin > 60 ? Math.ceil(diffMin / 60) + 'h' : diffMin + 'min') + '.';
    }
  }

  var isConvoLimit = data && data.limit_type === 'conversation';
  var msg = isConvoLimit
    ? 'Conversation limit reached (' + limit.perConvo + ' messages). Clear the chat to continue.'
    : 'Daily chat limit reached (' + limit.perDay + '/day).' + resetText;

  banner.innerHTML = '<div class="chat-rate-msg">' +
    '<i data-lucide="triangle-alert" class="icon-sm icon-stroke"></i>' +
    '<span>' + msg + '</span></div>';

  if (tier !== 'pro') {
    banner.innerHTML += '<a href="#" class="chat-rate-upgrade" onclick="event.preventDefault();document.querySelector(\'[data-page=billing]\')?.click();">Upgrade for more →</a>';
  }
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  // PostHog: chat_rate_limited
  if (window.posthog) {
    try { posthog.capture('chat_rate_limited', { limit_type: (data && data.limit_type) || 'daily', tier: getUserTier() }); } catch(e) { reportError('chat:chat', e); }
  }
  banner.style.display = 'block';
}


// ============================================================
// SESSION 4: Saved Prompts + Persistence
// Save/load chat prompts to Supabase, derived_filters update on every send
// ============================================================

// --- Saved Prompts State ---
var _savedPrompts = []; // { id, name, color_index, conversation, derived_filters, is_active, created_at }
var _saveDialogOpen = false;
var _loadDropdownOpen = false;
var _currentPromptId = null; // ID of the currently loaded prompt (null = unsaved)

// 10-color palette for prompts
var PROMPT_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'
];

// --- Init Save/Load buttons ---
function initSavedPrompts() {
  // UX-001: Header Load/Save buttons removed — saves through inline save-prompt-row,
  // loads through Saved Searches & Prompts list exclusively

  // Close load dropdown on outside click (legacy — keep for safety)
  document.addEventListener('click', function(e) {
    if (_loadDropdownOpen) {
      var dropdown = document.getElementById('chat-load-dropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        closeLoadDropdown();
      }
    }
  });

  // QA-FIX: Inline save prompt button (matches filter save pattern)
  var inlineSaveBtn = document.getElementById('save-prompt-inline-go');
  if (inlineSaveBtn) {
    inlineSaveBtn.addEventListener('click', async function() {
      var nameInput = document.getElementById('save-prompt-inline-name');
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        nameInput.style.borderColor = 'var(--red)';
        nameInput.focus();
        return;
      }
      nameInput.style.borderColor = '';
      inlineSaveBtn.disabled = true;
      inlineSaveBtn.textContent = 'Saving...';
      try {
        var derivedFilters = {};
        for (var i = _chatSession.messages.length - 1; i >= 0; i--) {
          if (_chatSession.messages[i].filters) {
            derivedFilters = _chatSession.messages[i].filters;
            break;
          }
        }
        var conversation = _chatSession.getHistory();
        var session = await sb.auth.getSession();
        if (!session.data.session) {
          if (typeof showToast === 'function') showToast('Please sign in', 'error');
          return;
        }
        var token = session.data.session.access_token;
        var userId = session.data.session.user.id;
        var resp = await fetch(SUPABASE_URL + '/rest/v1/saved_prompts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'apikey': SUPABASE_KEY,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            user_id: userId,
            name: name,
            color_index: Math.floor(Math.random() * PROMPT_COLORS.length),
            conversation: conversation,
            derived_filters: derivedFilters,
            is_active: true
          })
        });
        if (!resp.ok) throw new Error('Save failed: ' + resp.status);
        var saved = await resp.json();
        if (Array.isArray(saved) && saved.length > 0) {
          _currentPromptId = saved[0].id;
        }
        await loadSavedPromptsFromDB();
        if (typeof showToast === 'function') showToast('Prompt saved: ' + name, 'success');
        updateLoadedPromptIndicator();
        // Hide the save row now that it's saved
        var row = document.getElementById('save-prompt-row');
        if (row) row.classList.add('u-hidden');
        nameInput.value = '';
        // Re-render saved searches to show new prompt
        if (typeof renderSavedFilters === 'function') renderSavedFilters();
      } catch(err) {
        reportError('chat:inline-save', err);
        if (typeof showToast === 'function') showToast('Failed to save prompt', 'error');
      } finally {
        inlineSaveBtn.disabled = false;
        inlineSaveBtn.textContent = 'Save';
      }
    });
  }

  // Load saved prompts from Supabase
  loadSavedPromptsFromDB();
}

// --- Save Dialog ---
// UX-001: Save dialog removed — inline save-prompt-row handles all prompt saving
function openSaveDialog() {
  // Redirect to inline save row
  var saveRow = document.getElementById('save-prompt-row');
  if (saveRow) {
    saveRow.classList.remove('u-hidden');
    var nameInput = document.getElementById('save-prompt-inline-name');
    if (nameInput) nameInput.focus();
  }
}

function closeSaveDialog() {
  _saveDialogOpen = false;
}

function renderDerivedFiltersPreview(dialog) {
  var previewEl = dialog.querySelector('#save-prompt-filters-preview');
  if (!previewEl) return;

  // Get last extracted filters from conversation
  var lastFilters = null;
  for (var i = _chatSession.messages.length - 1; i >= 0; i--) {
    if (_chatSession.messages[i].filters) {
      lastFilters = _chatSession.messages[i].filters;
      break;
    }
  }

  if (!lastFilters || Object.keys(lastFilters).length === 0) {
    previewEl.innerHTML = '<span class="save-filters-empty">No filters extracted yet — send a message to generate filters</span>';
    return;
  }

  var parts = [];
  if (lastFilters.keywords && lastFilters.keywords.length) parts.push('<span class="sfp-tag">' + lastFilters.keywords.map(escapeHtml).join('</span><span class="sfp-tag">') + '</span>');
  if (lastFilters.locations && lastFilters.locations.length) parts.push('<span class="sfp-tag sfp-loc">' + lastFilters.locations.map(escapeHtml).join('</span><span class="sfp-tag sfp-loc">') + '</span>');
  if (lastFilters.level) parts.push('<span class="sfp-tag sfp-level">' + escapeHtml(lastFilters.level) + '</span>');
  if (lastFilters.salary_min || lastFilters.salary_max) {
    var sal = '';
    if (lastFilters.salary_min) sal += '$' + Math.round(lastFilters.salary_min/1000) + 'k';
    if (lastFilters.salary_min && lastFilters.salary_max) sal += '-';
    if (lastFilters.salary_max) sal += '$' + Math.round(lastFilters.salary_max/1000) + 'k';
    if (lastFilters.salary_min && !lastFilters.salary_max) sal += '+';
    parts.push('<span class="sfp-tag sfp-sal">' + sal + '</span>');
  }
  if (lastFilters.remote) parts.push('<span class="sfp-tag sfp-type">Remote</span>');

  previewEl.innerHTML = parts.length > 0 ? parts.join('') : '<span class="save-filters-empty">No structured filters detected</span>';
}

async function executeSavePrompt() {
  var dialog = document.getElementById('chat-save-dialog');
  if (!dialog) return;

  var nameInput = dialog.querySelector('#save-prompt-name');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    nameInput.style.borderColor = 'var(--red)';
    nameInput.focus();
    return;
  }
  if (name.length > 60) {
    if (typeof showToast === 'function') showToast('Name too long (max 60 characters)', 'error');
    return;
  }

  // Get selected color
  var activeSwatch = dialog.querySelector('.save-color-swatch.active');
  var colorIndex = activeSwatch ? parseInt(activeSwatch.getAttribute('data-color-idx')) : 0;

  // Get derived filters from last assistant message
  var derivedFilters = {};
  for (var i = _chatSession.messages.length - 1; i >= 0; i--) {
    if (_chatSession.messages[i].filters) {
      derivedFilters = _chatSession.messages[i].filters;
      break;
    }
  }

  var conversation = _chatSession.getHistory();

  // Disable button
  var confirmBtn = dialog.querySelector('#save-prompt-confirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Saving...'; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) {
      if (typeof showToast === 'function') showToast('Please sign in', 'error');
      return;
    }

    var token = session.data.session.access_token;
    var userId = session.data.session.user.id;
    var body = {
      user_id: userId,
      name: name,
      color_index: colorIndex,
      conversation: conversation,
      derived_filters: derivedFilters,
      is_active: true
    };

    var method = 'POST';
    var url = SUPABASE_URL + '/rest/v1/saved_prompts';
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=representation'
    };

    // If updating existing prompt
    if (_currentPromptId) {
      url += '?id=eq.' + _currentPromptId;
      method = 'PATCH';
      delete body.user_id; // Don't update user_id
    }

    var resp = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      var errData = null;
      try { errData = await resp.json(); } catch(e) { reportError('chat:chat', e); }
      console.error('[BJ] Save prompt error:', errData);
      if (typeof showToast === 'function') showToast('Failed to save prompt', 'error');
      return;
    }

    var saved = await resp.json();
    if (Array.isArray(saved) && saved.length > 0) {
      _currentPromptId = saved[0].id;
    }

    // Refresh saved prompts list
    await loadSavedPromptsFromDB();

    closeSaveDialog();
    if (typeof showToast === 'function') showToast('Prompt saved: ' + name, 'success');

    // Update header to show loaded prompt name
    updateLoadedPromptIndicator();

    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_prompt_saved', { name: name, color_index: colorIndex, filter_count: Object.keys(derivedFilters).length, is_update: !!_currentPromptId }); } catch(e) { reportError('chat:chat', e); }
    }

  } catch (err) {
    reportError('chat', err);
    console.error('[BJ] Save prompt error:', err);
    if (typeof showToast === 'function') showToast('Save failed', 'error');
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Save'; }
  }
}

// --- Load Dropdown ---
function toggleLoadDropdown() {
  if (_loadDropdownOpen) {
    closeLoadDropdown();
  } else {
    openLoadDropdown();
  }
}

function openLoadDropdown() {
  var dropdown = document.getElementById('chat-load-dropdown');
  if (!dropdown) return;

  // Render prompt list
  renderLoadDropdownItems(dropdown);

  dropdown.style.display = 'block';
  _loadDropdownOpen = true;
}

function closeLoadDropdown() {
  var dropdown = document.getElementById('chat-load-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  _loadDropdownOpen = false;
}

function renderLoadDropdownItems(dropdown) {
  if (!dropdown) return;

  if (_savedPrompts.length === 0) {
    dropdown.innerHTML = '<div class="cld-empty">No saved prompts yet</div>';
    return;
  }

  var html = '';
  _savedPrompts.forEach(function(prompt) {
    var color = PROMPT_COLORS[prompt.color_index || 0];
    var isLoaded = prompt.id === _currentPromptId;
    var filterCount = prompt.derived_filters ? Object.keys(prompt.derived_filters).length : 0;
    var timeAgo = _timeAgo(prompt.updated_at || prompt.created_at);

    html += '<div class="cld-item' + (isLoaded ? ' cld-item-active' : '') + '" data-prompt-id="' + prompt.id + '">' +
      '<div class="cld-item-color" style="background:' + color + ';"></div>' +
      '<div class="cld-item-info">' +
        '<div class="cld-item-name">' + escapeHtml(prompt.name) + '</div>' +
        '<div class="cld-item-meta">' + filterCount + ' filter' + (filterCount !== 1 ? 's' : '') + ' · ' + timeAgo + '</div>' +
      '</div>' +
      '<div class="cld-item-actions">' +
        '<button class="cld-delete-btn" data-prompt-id="' + prompt.id + '" title="Delete">✕</button>' +
      '</div>' +
    '</div>';
  });

  dropdown.innerHTML = html;

  // Bind click handlers
  dropdown.querySelectorAll('.cld-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (e.target.closest('.cld-delete-btn')) return;
      var promptId = item.getAttribute('data-prompt-id');
      loadPrompt(promptId);
      closeLoadDropdown();
    });
  });

  dropdown.querySelectorAll('.cld-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var promptId = btn.getAttribute('data-prompt-id');
      deletePrompt(promptId);
    });
  });
}

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + 'm ago';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + 'd ago';
  return d.toLocaleDateString();
}

// --- Load prompt into chat session ---
async function loadPrompt(promptId) {
  var prompt = _savedPrompts.find(function(p) { return p.id === promptId; });
  if (!prompt) return;

  // Clear current session
  _chatSession.clear();
  _chatMessages = [];
  _chatLastSyncedFilterHash = null;

  // Restore conversation
  if (prompt.conversation && Array.isArray(prompt.conversation)) {
    prompt.conversation.forEach(function(msg) {
      _chatSession.addMessage(msg.role, msg.content, null);
    });
  }

  _currentPromptId = promptId;
  renderChatMessages();
  updateChatCounter();
  updateLoadedPromptIndicator();

  // If derived_filters exist, apply to job feed
  if (prompt.derived_filters && Object.keys(prompt.derived_filters).length > 0) {
    applyChatFilters(prompt.derived_filters);
  }

  if (typeof showToast === 'function') showToast('Loaded: ' + prompt.name, 'success');

  // PostHog
  if (window.posthog) {
    try { posthog.capture('chat_prompt_loaded', { prompt_id: promptId, name: prompt.name }); } catch(e) { reportError('chat:chat', e); }
  }
}

// --- Delete prompt ---
async function deletePrompt(promptId) {
  if (!confirm('Delete this saved prompt?')) return;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?id=eq.' + promptId, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      }
    });

    if (resp.ok) {
      // If we deleted the currently loaded prompt, clear reference
      if (_currentPromptId === promptId) {
        _currentPromptId = null;
        updateLoadedPromptIndicator();
      }

      await loadSavedPromptsFromDB();
      renderLoadDropdownItems(document.getElementById('chat-load-dropdown'));

      if (typeof showToast === 'function') showToast('Prompt deleted', 'success');

      // Also remove from filter selector
      renderSavedPromptsInFilterSelector();

      // PostHog
      if (window.posthog) {
        try { posthog.capture('chat_prompt_deleted', { prompt_id: promptId }); } catch(e) { reportError('chat:chat', e); }
      }
    }
  } catch(err) { reportError('chat', err); console.error('[BJ] Delete prompt error:', err);
  }
}

// --- Load saved prompts from DB ---
async function loadSavedPromptsFromDB() {
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?select=id,name,color_index,conversation,derived_filters,is_active,resume_id,created_at,updated_at&order=updated_at.desc&limit=50', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      }
    });

    if (resp.ok) {
      _savedPrompts = await resp.json();
      // Update filter selector
      renderSavedPromptsInFilterSelector();
    }
  } catch(err) { reportError('chat', err); console.error('[BJ] Load saved prompts error:', err);
  }
}

// --- Update derived_filters on every conversation message ---
async function updateDerivedFilters() {
  if (!_currentPromptId) return; // Only update if we have a saved prompt loaded
  if (_chatSession.messages.length === 0) return;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;

    // Call prompt-to-filter to re-extract
    var resp = await fetch(SUPABASE_URL + '/functions/v1/prompt-to-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ conversation: _chatSession.getHistory() })
    });

    if (!resp.ok) return;

    var data = await resp.json();
    var filters = data.filters;
    if (!filters || typeof filters !== 'object') return;

    // Update the saved prompt in DB
    await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?id=eq.' + _currentPromptId, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        derived_filters: filters,
        conversation: _chatSession.getHistory()
      })
    });

    // Update local cache
    var cached = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
    if (cached) {
      cached.derived_filters = filters;
      cached.conversation = _chatSession.getHistory();
    }

  } catch(err) { reportError('chat', err); console.error('[BJ] Update derived_filters error:', err);
  }
}

// --- Show loaded prompt name in header ---
function updateLoadedPromptIndicator() {
  var indicator = document.getElementById('chat-loaded-prompt');
  if (!indicator) return;

  if (_currentPromptId) {
    var prompt = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
    if (prompt) {
      var color = PROMPT_COLORS[prompt.color_index || 0];
      indicator.innerHTML = '<span class="clp-dot" style="background:' + color + ';"></span>' +
        '<span class="clp-name">' + escapeHtml(prompt.name) + '</span>';
      indicator.style.display = 'flex';
      return;
    }
  }
  indicator.style.display = 'none';
}

// --- Add saved prompts to filter selector ---
function renderSavedPromptsInFilterSelector() {
  var container = document.getElementById('sf-list');
  if (!container) return;

  // Remove existing chat prompt items
  container.querySelectorAll('.sf-item-prompt').forEach(function(el) { el.remove(); });

  if (_savedPrompts.length === 0) return;

  // Add a separator before chat prompts
  var sep = document.createElement('div');
  sep.className = 'sf-item-prompt sf-prompt-separator';
  sep.innerHTML = '<i data-lucide="message-square" class="icon-xs icon-stroke" style="flex-shrink:0;opacity:0.5;"></i>' +
    '<span style="font-size:10px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;">Chat Prompts</span>';
  container.appendChild(sep);

  // Add each saved prompt as a filter selector item
  _savedPrompts.forEach(function(prompt) {
    var color = PROMPT_COLORS[prompt.color_index || 0];
    var filterCount = prompt.derived_filters ? Object.keys(prompt.derived_filters).length : 0;

    var item = document.createElement('div');
    item.className = 'sf-item sf-item-prompt';
    item.setAttribute('data-prompt-id', prompt.id);

    item.innerHTML =
      '<div class="sf-item-left">' +
        '<div class="sf-color-dot" style="background:' + color + ';"></div>' +
        '<i data-lucide="message-square" class="icon-xs icon-stroke" style="flex-shrink:0;margin-right:4px;" stroke="' + color + '"></i>' +
        '<span class="sf-name">' + escapeHtml(prompt.name) + '</span>' +
        '<span class="sf-count">' + filterCount + '</span>' +
      '</div>';

    item.addEventListener('click', function() {
      // Switch to chat mode and load this prompt
      setSearchMode('chat');
      setTimeout(function() { loadPrompt(prompt.id); }, 300);
    });

    container.appendChild(item);
  });
  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}


// ============================================================
// SESSION 5: System Integration
// Prompts integrated with job feed, notifications, auto-apply, match %
// ============================================================

// --- Session 5: Prompt resume assignment ---
// Track which resume is assigned to a prompt (for auto-apply + match %)
function assignResumeToPrompt(promptId, resumeId) {
  if (!promptId || !currentUser) return;
  var prompt = _savedPrompts.find(function(p) { return p.id === promptId; });
  if (!prompt) return;

  prompt.resume_id = resumeId;

  // Persist to Supabase
  fetch(SUPABASE_URL + '/rest/v1/saved_prompts?id=eq.' + promptId, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (sb.auth.session()?.access_token || SUPABASE_ANON_KEY),
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ resume_id: resumeId })
  }).then(function(resp) {
    if (resp.ok) {
      console.log('[BJ] Resume assigned to prompt:', promptId, '->', resumeId);
      if (typeof posthog !== 'undefined') {
        posthog.capture('chat_prompt_resume_assigned', { prompt_id: promptId, resume_id: resumeId });
      }
    }
  }).catch(function(err) {
    console.error('[BJ] Prompt resume assignment failed:', err);
  });
}

// --- Session 5: Prompt → Saved Filter interoperability ---
// Convert a saved prompt's derived_filters to the same shape searchJobs() consumes
// This is called by job-feed.js getCheckedSavedPromptFilters() via the global promptDerivedToFilterObj()

// --- Session 5: Register prompts with notification system ---
// After prompts load, refresh the notification override dropdown to include them
function integratePromptsWithNotifications() {
  if (typeof refreshOverrideFilterSelectWithPrompts === 'function') {
    refreshOverrideFilterSelectWithPrompts();
  }
}

// --- Session 5: Register prompts with auto-apply system ---
// Prompts with resume assignments and derived_filters participate in auto-apply matching
function getPromptAutoApplyConfigs() {
  if (!_savedPrompts || _savedPrompts.length === 0) return [];
  return _savedPrompts.filter(function(p) {
    return p.derived_filters && Object.keys(p.derived_filters).length > 0 && p.resume_id;
  }).map(function(p) {
    return {
      type: 'prompt',
      id: p.id,
      name: p.name,
      derived_filters: p.derived_filters,
      resume_id: p.resume_id,
      color_index: p.color_index
    };
  });
}

// --- Session 5: Hook into prompt lifecycle ---
// After loading prompts from DB, run system integrations
var _origLoadSavedPromptsFromDB = loadSavedPromptsFromDB;
loadSavedPromptsFromDB = async function() {
  await _origLoadSavedPromptsFromDB();
  // Run integrations after prompts are loaded
  integratePromptsWithNotifications();
  // Recompute match scores if jobs are loaded
  if (typeof computeVisibleJobScores === 'function') {
    computeVisibleJobScores();
  }
};

// --- Session 5: Expose prompt configs for auto-apply Edge Function consumption ---
// The auto-apply system checks both saved filters and saved prompts
window._getPromptAutoApplyConfigs = getPromptAutoApplyConfigs;
window._assignResumeToPrompt = assignResumeToPrompt;
// QA-FIX: Expose prompts for unified saved search list (getter survives internal reassignment)
window._getSavedPrompts = function() { return _savedPrompts; };
window._loadPrompt = loadPrompt;
window._deletePrompt = deletePrompt;

// --- Initialize on page load ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatMode);
} else {
  initChatMode();
}

// CS-P1-004 FE-005: Register chat exports with BJ namespace
(function() {
  ['_assignResumeToPrompt','_getPromptAutoApplyConfigs'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'chat', registered: Date.now() };
    }
  });
})();


// === js/apply-workflow.js ===
/**
 * Brilliant Jobs — Apply Workflow v5.18
 * Score Gate Modal, Pending Applications, and Apply State Machine
 * 
 * Phase 2: Real ATS Submission (Pod 2)
 * - Score Gate Modal: intercepts Apply when score is low/unscored
 * - Pending Applications: Supabase-backed with real ATS submission
 * - Apply Settings: per-filter configuration
 * - Rewrite Review Modal: shows AI rewrite diff
 * - scoreAndRecheck: calls score-resume EF (1 credit)
 * - triggerRewrite: opens existing rewrite panel (3 credits)
 * - proceedToApply: creates pending_applications row + calls submit-application
 * - approvePendingApp: calls submit-application on approval
 * - submit-application EF: Recruitee (real API), others (mock fallback)
 */

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

var APPLY_MODES = {
  MANUAL:           'manual',
  SCORE_GATED:      'score_gated',
  AUTO:             'auto',
  SCORE_GATED_AUTO: 'score_gated_auto',
  AUTO_REWRITE:     'auto_rewrite',
  AUTOPILOT:        'autopilot'
};

var APPLY_STATUS = {
  PENDING:    'pending',
  APPROVED:   'approved',
  PROCESSING: 'processing',
  SUBMITTED:  'submitted',
  SKIPPED:    'skipped',
  EXPIRED:    'expired',
  FAILED:     'failed'
};

var DEFAULT_APPLY_SETTINGS = {
  default_apply_mode: APPLY_MODES.MANUAL,
  default_score_threshold: 70,
  default_approval_required: true,
  default_notification_channels: ['in_app', 'email'],
  sms_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  auto_expire_hours: 48
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

var pendingApplications = [];
var userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS);
var _applySubmitting = false; // Prevent double-submit
var _activePollers = {}; // EXT-AS-7: Track active status pollers by appId

// ═══════════════════════════════════════════════════════════
// AF-006: DASHBOARD ACTIVITY LOGGING
// Fire-and-forget writes to user_activity_log via log-user-activity EF.
// ═══════════════════════════════════════════════════════════

var _dashActivityQueue = [];
var _dashActivityTimer = null;

function logDashboardActivity(activityType, data) {
  try {
    var item = {
      client_id: 'db-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      activity_type: activityType,
      source: 'dashboard',
      job_title: data.jobTitle || null,
      company: data.company || null,
      job_url: data.jobUrl || null,
      score: typeof data.score === 'number' ? data.score : null,
      mode: data.mode || null,
      metadata: data.metadata || {},
      created_at: new Date().toISOString()
    };
    _dashActivityQueue.push(item);

    // 5s debounce flush
    if (_dashActivityTimer) clearTimeout(_dashActivityTimer);
    _dashActivityTimer = setTimeout(_flushDashboardActivity, 5000);
  } catch (e) {
    if (typeof reportError === 'function') reportError('af006_log', e);
  }
}

async function _flushDashboardActivity() {
  _dashActivityTimer = null;
  if (_dashActivityQueue.length === 0) return;

  var batch = _dashActivityQueue.splice(0, 50);
  try {
    var token = (typeof currentUser !== 'undefined' && currentUser && currentUser.access_token)
      ? currentUser.access_token : null;
    if (!token && typeof sb !== 'undefined' && sb.auth) {
      var sess = await sb.auth.getSession();
      token = sess && sess.data && sess.data.session ? sess.data.session.access_token : null;
    }
    if (!token) return;

    var gatewayBase = 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway';
    fetch(gatewayBase + '/log-user-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ action: 'batch', items: batch })
    }).catch(function() {}); // fire-and-forget
  } catch (e) {
    if (typeof reportError === 'function') reportError('af006_flush', e);
  }
}

// ═══════════════════════════════════════════════════════════
// AF-002: FIRST-TIME SETUP GATE
// Blocks all apply actions until user completes initial setup:
//   1. applicant_profile with first_name, last_name, email
//   2. applicationMode explicitly set (not null/undefined)
//   3. activeResumeId is set
// ═══════════════════════════════════════════════════════════

/**
 * Check if user has completed the first-time setup requirements.
 * Reads from localStorage applySettings and applicantProfile cache.
 * @returns {boolean} true if all setup criteria met
 */
function isSetupComplete() {
  try {
    // Fast path: check cached flag first
    var settings = null;
    try { settings = JSON.parse(localStorage.getItem('bj_apply_settings') || 'null'); } catch (e) { /* ignore */ }
    if (settings && settings.setup_complete === true) return true;

    // Check criteria individually
    var profile = null;
    try { profile = JSON.parse(localStorage.getItem('bj_applicant_profile') || 'null'); } catch (e) { /* ignore */ }

    var hasProfile = profile && profile.name && profile.name.trim().length > 0 && profile.email && profile.email.trim().length > 0;
    var hasMode = settings && settings.default_apply_mode && settings.default_apply_mode !== 'null' && settings.default_apply_mode !== '';
    // Check explicit active_resume_id, then window global, then any uploaded resume
    var hasResume = (settings && settings.active_resume_id)
      || (typeof window._activeResumeId !== 'undefined' && window._activeResumeId)
      || (typeof resumes !== 'undefined' && Array.isArray(resumes) && resumes.length > 0);

    return !!(hasProfile && hasMode && hasResume);
  } catch (e) {
    reportError('apply-workflow:isSetupComplete', e);
    return false;
  }
}

/**
 * Show the setup gate modal — blocks apply actions until setup is complete.
 * Reusable across job feed and pipeline surfaces.
 */
function showSetupGateModal() {
  var overlay = document.getElementById('setup-gate-overlay');
  if (overlay) {
    overlay.classList.remove('u-hidden');
    overlay.style.display = 'flex';
  }
  if (typeof posthog !== 'undefined') posthog.capture('setup_gate_shown', { surface: 'dashboard' });
}

/**
 * Hide the setup gate modal.
 */
function hideSetupGateModal() {
  var overlay = document.getElementById('setup-gate-overlay');
  if (overlay) {
    overlay.classList.add('u-hidden');
    overlay.style.display = 'none';
  }
}

/**
 * Navigate to Settings tab to complete setup. Called from gate modal button.
 */
function navigateToSetup() {
  hideSetupGateModal();
  // Navigate to settings page
  var settingsNav = document.querySelector('[data-page="settings"]') || document.querySelector('.nav-item[data-page="settings"]');
  if (settingsNav) settingsNav.click();
  if (typeof posthog !== 'undefined') posthog.capture('setup_gate_navigate', { target: 'settings' });
}

/**
 * After profile/settings save, check if all setup criteria are now met.
 * If so, set setup_complete flag in Supabase and localStorage.
 * @returns {Promise<boolean>} true if setup is now complete
 */
async function checkAndSetSetupComplete() {
  if (!currentUser) return false;
  try {
    var profile = null;
    try { profile = JSON.parse(localStorage.getItem('bj_applicant_profile') || 'null'); } catch (e) { /* ignore */ }
    var settings = null;
    try { settings = JSON.parse(localStorage.getItem('bj_apply_settings') || 'null'); } catch (e) { /* ignore */ }

    var hasProfile = profile && profile.name && profile.name.trim().length > 0 && profile.email && profile.email.trim().length > 0;
    var hasMode = settings && settings.default_apply_mode && settings.default_apply_mode !== 'null' && settings.default_apply_mode !== '';
    var hasResume = (settings && settings.active_resume_id)
      || (typeof window._activeResumeId !== 'undefined' && window._activeResumeId)
      || (typeof resumes !== 'undefined' && Array.isArray(resumes) && resumes.length > 0);

    if (hasProfile && hasMode && hasResume) {
      // Set flag in localStorage
      if (!settings) settings = {};
      settings.setup_complete = true;
      localStorage.setItem('bj_apply_settings', JSON.stringify(settings));

      // Persist to Supabase
      var res = await safeQuery(function() {
        return sb.from('profiles').select('user_data').eq('id', currentUser.id).maybeSingle();
      }, { label: 'apply-workflow:check-setup-complete', fallback: null });
      var ud = (res && res.user_data) || {};
      if (!ud.apply_settings) ud.apply_settings = {};
      ud.apply_settings.setup_complete = true;
      await sb.from('profiles').update({ user_data: ud }).eq('id', currentUser.id);

      if (typeof posthog !== 'undefined') posthog.capture('setup_complete', { has_eeo: !!(profile.eeo_preferences && (profile.eeo_preferences.gender || profile.eeo_preferences.ethnicity)) });
      return true;
    }
    return false;
  } catch (e) {
    reportError('apply-workflow:checkAndSetSetupComplete', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// EXT-AS-7: DASHBOARD → WORKER ROUTING
// Recruitee stays on direct API. All other ATS route through
// headless worker (AS-1/2/3) via pending_applications polling.
// ═══════════════════════════════════════════════════════════

function _isRecruiteeJob(url) {
  return url && url.indexOf('recruitee') >= 0;
}

/**
 * Route a submission through the headless worker.
 * Sets status to approved (worker polls every 30s), then polls for result.
 * @param {Object} app - The pending_application row (must have .id, .job_url, .company_name, .job_title)
 */
async function _routeToWorker(app) {
  // PostHog: track worker queue event
  if (typeof posthog !== 'undefined') {
    posthog.capture('worker_submission_queued', {
      app_id: app.id,
      ats_source: _guessAtsSource(app.job_url),
      company: app.company_name,
      platform: 'dashboard',
    });
  }

  // Create pipeline entry immediately so job appears on Board
  // upsert won't duplicate — keyed on user_id + job_id + ats_source
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(app.job_id, {
      stage: 'applied',
      title: app.job_title || '',
      companyName: app.company_name || '',
      company: app.company_name || '',
      jobUrl: app.job_url || '',
      atsSource: _guessAtsSource(app.job_url),
      appliedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    });
  }

  _renderLiveStatus(app.id, 'queued', 'Queued for submission...');

  // Start polling for worker status updates
  _pollApplicationStatus(app.id);
}

/**
 * Poll pending_applications for status changes.
 * Worker sets: approved → processing → submitted|failed
 * Polls every 3s, times out after 5 minutes.
 */
function _pollApplicationStatus(appId) {
  // Don't double-poll
  if (_activePollers[appId]) return;

  var startTime = Date.now();
  var POLL_INTERVAL = 3000; // 3s
  var POLL_TIMEOUT = 300000; // 5 minutes

  _activePollers[appId] = setInterval(async function() {
    // Timeout check
    if (Date.now() - startTime > POLL_TIMEOUT) {
      _stopPolling(appId);
      _renderLiveStatus(appId, 'timeout', 'Worker did not pick up in time. Retry from queue.');
      return;
    }

    try {
      // Use outer-scope sb (Supabase client) — do NOT reassign from window.supabase (that's the constructor)

      var { data, error } = await sb
        .from('pending_applications')
        .select('status, submitted_at, submission_error')
        .eq('id', appId)
        .single();

      if (error || !data) return;

      if (data.status === 'processing') {
        _renderLiveStatus(appId, 'processing', 'Worker is submitting...');
      } else if (data.status === 'submitted') {
        _stopPolling(appId);
        _renderLiveStatus(appId, 'submitted', 'Application submitted!');
        // Update local cache
        var localApp = pendingApplications.find(function(a) { return a.id === appId; });
        if (localApp) {
          localApp.status = 'submitted';
          localApp.submitted_at = data.submitted_at;
          _updatePipelineApplied(localApp.job_id);
        }
        if (typeof posthog !== 'undefined') {
          posthog.capture('worker_submission_complete', {
            app_id: appId,
            status: 'submitted',
            duration_ms: Date.now() - startTime,
            platform: 'dashboard',
          });
        }
        // Refresh list after a brief delay
        setTimeout(function() { loadPendingApplications().then(renderPendingApplications); }, 2000);
      } else if (data.status === 'failed') {
        _stopPolling(appId);
        _renderLiveStatus(appId, 'failed', data.submission_error || 'Submission failed. You can retry.');
        var localApp2 = pendingApplications.find(function(a) { return a.id === appId; });
        if (localApp2) localApp2.status = 'failed';
        if (typeof posthog !== 'undefined') {
          posthog.capture('worker_submission_complete', {
            app_id: appId,
            status: 'failed',
            error: data.submission_error || 'unknown',
            duration_ms: Date.now() - startTime,
            platform: 'dashboard',
          });
        }
        setTimeout(function() { loadPendingApplications().then(renderPendingApplications); }, 2000);
      }
    } catch (e) {
      reportError('apply-workflow:poll', e);
    }
  }, POLL_INTERVAL);
}

function _stopPolling(appId) {
  if (_activePollers[appId]) {
    clearInterval(_activePollers[appId]);
    delete _activePollers[appId];
  }
}

/**
 * Render live submission status inline on a pending app card.
 * Uses data-app-id to find the card and update the center section.
 */
function _renderLiveStatus(appId, status, message) {
  var card = document.querySelector('.pa-card[data-app-id="' + appId + '"]');
  if (!card) return;

  var center = card.querySelector('.pa-card-center');
  var actions = card.querySelector('.pa-card-actions');
  if (!center) return;

  var iconHtml = '';
  if (status === 'queued' || status === 'processing') {
    iconHtml = '<i data-lucide="loader-2" class="icon-md" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  } else if (status === 'submitted') {
    iconHtml = '<i data-lucide="circle-check" class="icon-md" style="color:var(--success);display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  } else if (status === 'failed' || status === 'timeout') {
    iconHtml = '<i data-lucide="circle-x" class="icon-md" style="color:var(--error);display:inline-block;vertical-align:middle;margin-right:6px;"></i>';
  }

  center.innerHTML = '<span class="pa-live-status">' + iconHtml + '<span>' + escapeHtml(message) + '</span></span>';

  // Disable action buttons while processing
  if (status === 'queued' || status === 'processing') {
    if (actions) actions.innerHTML = '<span style="font-size:11px;color:var(--muted);">Processing...</span>';
  } else if (status === 'submitted') {
    if (actions) actions.innerHTML = '<span style="font-size:11px;color:var(--success);">Done</span>';
  }
  // For failed/timeout, leave actions as-is (retry button renders from renderPendingApplications)

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════
// AF-004: processApplyQueueByMode — mode-aware queue processing
// ═══════════════════════════════════════════════════════════

/**
 * AF-004: Batch score multiple pending apps in parallel using score-resume EF.
 * Returns map of app.id → { match_score, ... }
 */
async function _batchScorePendingApps(apps) {
  var scores = {};
  var token = await _getAuthToken();
  if (!token) return scores;

  var resume = _getActiveResume();
  var resumeText = null;

  // Attempt to get resume text from archive (same pattern as _scoreAndAutoRoute)
  try {
    if (currentUser && resume.id) {
      var archiveRes = await sb.from('resume_archive')
        .select('resume_text')
        .eq('user_id', currentUser.id)
        .eq('id', resume.id)
        .single();
      if (archiveRes.data && archiveRes.data.resume_text) {
        resumeText = archiveRes.data.resume_text;
      }
    }
  } catch(e) { /* fallback to localStorage */ }

  if (!resumeText) {
    try {
      var stored = localStorage.getItem('bj_resume_text');
      if (stored && !stored.startsWith('enc:')) resumeText = stored;
    } catch(e) { /* ignore */ }
  }

  if (!resumeText) return scores;

  // Parallel scoring: chunk into groups of 5 to avoid EF rate limits
  var CHUNK = 5;
  for (var i = 0; i < apps.length; i += CHUNK) {
    var chunk = apps.slice(i, i + CHUNK);
    var chunkJobIds = chunk.map(function(a) { return a.job_id; });

    try {
      var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
        },
        body: JSON.stringify({
          resume_text: resumeText,
          mode: 'batch',
          tier: 'basic',
          job_ids: chunkJobIds,
          resume_id: resume.id,
        }),
      });
      var data = await res.json();
      if (res.ok && data.results) {
        data.results.forEach(function(r) {
          // Find matching app by job_id
          var app = chunk.find(function(a) { return a.job_id === r.job_id; });
          if (app) scores[app.id] = r;
        });
      } else if (res.ok && data.match_score !== undefined && chunk.length === 1) {
        // Single-item batch returned as single result
        scores[chunk[0].id] = data;
      }
    } catch(e) {
      reportError('apply_workflow:batch_score', e);
    }
  }
  return scores;
}

/**
 * AF-004: Render batch scoring results in the pending apps panel.
 * Updates each app row with a score badge and pass/fail indicator.
 */
function _renderBatchScoreResults(apps, scores, threshold) {
  apps.forEach(function(app) {
    var scoreData = scores[app.id];
    if (!scoreData) return;
    var score = scoreData.match_score;
    if (score === undefined || score === null) return;
    app.original_score = score;

    var passes = score >= threshold;
    var row = document.querySelector('[data-app-id="' + app.id + '"]');
    if (!row) return;

    var scoreEl = row.querySelector('.pa-score');
    if (scoreEl) {
      var cls = passes ? 'high' : score >= 50 ? 'mid' : 'low';
      scoreEl.className = 'pa-score pa-score-' + cls;
      scoreEl.textContent = score;
    }

    var badge = row.querySelector('.pa-badge');
    if (badge) {
      badge.textContent = passes ? '✓ Above threshold' : '✗ Below threshold';
      badge.style.background = passes ? 'var(--success, #22c55e)' : 'var(--muted, #94a3b8)';
      badge.style.color = '#fff';
    }
  });
}

/**
 * AF-004: Mode-aware Pipeline Process Queue dispatcher.
 * Wraps processApplyQueue with mode-specific routing.
 */
async function processApplyQueueByMode() {
  // AF-002: Setup gate
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }

  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING;
  });

  if (pending.length === 0) {
    if (typeof showToast === 'function') showToast('No pending applications to process.');
    return;
  }

  var mode = userApplySettings.default_apply_mode || APPLY_MODES.MANUAL;
  var threshold = userApplySettings.default_score_threshold || 70;

  // PostHog: queue session start
  if (typeof posthog !== 'undefined') {
    posthog.capture('pipeline_queue_mode', {
      mode: mode,
      pipeline_queue_batch_size: pending.length,
    });
  }

  // AF-006: Log pipeline queue processing to activity log
  for (var qi = 0; qi < pending.length; qi++) {
    logDashboardActivity('pipeline-queued', {
      jobTitle: pending[qi].job_title || '',
      company: pending[qi].company_name || '',
      jobUrl: pending[qi].job_url || '',
      mode: mode,
      metadata: { batch_size: pending.length, surface: 'pipeline' }
    });
  }

  // ── MANUAL: delegate to existing per-item flow ────────────────────────────
  if (mode === APPLY_MODES.MANUAL) {
    return processApplyQueue();
  }

  // ── AUTO APPLY: approve all immediately, route to worker ─────────────────
  if (mode === APPLY_MODES.AUTO) {
    var autoApproved = 0;
    for (var i = 0; i < pending.length; i++) {
      var app = pending[i];
      await updatePendingApplication(app.id, {
        status: APPLY_STATUS.APPROVED,
        approval_mode: 'auto_no_approval',
        responded_at: new Date().toISOString(),
      });
      app.status = APPLY_STATUS.APPROVED;
      _routeToWorker(app);
      autoApproved++;
    }
    if (typeof showToast === 'function') {
      showToast(autoApproved + ' application(s) queued for auto-submit.');
    }
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: autoApproved, mode: mode });
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── SCORE-GATED: score all, show results for review ───────────────────────
  if (mode === APPLY_MODES.SCORE_GATED) {
    if (typeof showToast === 'function') showToast('Scoring ' + pending.length + ' application(s)...', { duration: 10000 });
    var scores = await _batchScorePendingApps(pending);
    // Update app scores in memory
    pending.forEach(function(app) {
      if (scores[app.id] && scores[app.id].match_score !== undefined) {
        app.original_score = scores[app.id].match_score;
      }
    });
    renderPendingApplications();
    _renderBatchScoreResults(pending, scores, threshold);
    if (typeof showToast === 'function') {
      var above = pending.filter(function(a) { return a.original_score >= threshold; }).length;
      showToast('Scored ' + pending.length + ' app(s): ' + above + ' above threshold. Review below.', { duration: 6000 });
    }
    return;
  }

  // ── SCORE-GATED AUTO: score all, auto-approve above threshold ─────────────
  if (mode === APPLY_MODES.SCORE_GATED_AUTO) {
    if (typeof showToast === 'function') showToast('Scoring ' + pending.length + ' application(s)...', { duration: 10000 });
    var sgScores = await _batchScorePendingApps(pending);
    var sgAutoApproved = 0;
    var sgReview = [];

    for (var j = 0; j < pending.length; j++) {
      var sgApp = pending[j];
      var sgScore = sgScores[sgApp.id] ? sgScores[sgApp.id].match_score : null;
      sgApp.original_score = sgScore;

      if (sgScore !== null && sgScore >= threshold) {
        await updatePendingApplication(sgApp.id, {
          status: APPLY_STATUS.APPROVED,
          approval_mode: 'auto_no_approval',
          original_score: sgScore,
          responded_at: new Date().toISOString(),
        });
        sgApp.status = APPLY_STATUS.APPROVED;
        _routeToWorker(sgApp);
        sgAutoApproved++;
      } else {
        sgReview.push(sgApp);
      }
    }

    renderPendingApplications();
    _renderBatchScoreResults(pending, sgScores, threshold);
    if (typeof showToast === 'function') {
      showToast(sgAutoApproved + ' auto-approved, ' + sgReview.length + ' need review (below threshold).');
    }
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: sgAutoApproved, mode: mode, below_threshold: sgReview.length });
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── AUTO REWRITE: score, rewrite below-threshold, submit all ─────────────
  if (mode === APPLY_MODES.AUTO_REWRITE) {
    if (typeof showToast === 'function') showToast('Scoring and rewriting ' + pending.length + ' application(s)...', { duration: 12000 });
    var rwScores = await _batchScorePendingApps(pending);
    var rwApproved = 0;

    for (var k = 0; k < pending.length; k++) {
      var rwApp = pending[k];
      var rwScore = rwScores[rwApp.id] ? rwScores[rwApp.id].match_score : null;
      rwApp.original_score = rwScore;

      if (rwScore !== null && rwScore < threshold) {
        // Queue for rewrite-then-submit (sets approval_mode = 'rewrite_review')
        await updatePendingApplication(rwApp.id, {
          original_score: rwScore,
          approval_mode: 'rewrite_review',
        });
        rwApp.approval_mode = 'rewrite_review';
      } else {
        // Above threshold or unscored: route directly
        await updatePendingApplication(rwApp.id, {
          status: APPLY_STATUS.APPROVED,
          approval_mode: 'auto_no_approval',
          original_score: rwScore,
          responded_at: new Date().toISOString(),
        });
        rwApp.status = APPLY_STATUS.APPROVED;
        _routeToWorker(rwApp);
        rwApproved++;
      }
    }

    renderPendingApplications();
    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: rwApproved, mode: mode });
    }
    if (typeof showToast === 'function') {
      var rwRewrite = pending.length - rwApproved;
      showToast(rwApproved + ' queued directly, ' + rwRewrite + ' queued for rewrite before submit.');
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // ── FULL AUTOPILOT: rewrite + submit all ─────────────────────────────────
  if (mode === APPLY_MODES.AUTOPILOT) {
    if (typeof showToast === 'function') showToast('Full autopilot: rewriting and submitting ' + pending.length + ' application(s)...', { duration: 12000 });

    for (var m = 0; m < pending.length; m++) {
      var apApp = pending[m];
      await updatePendingApplication(apApp.id, {
        status: APPLY_STATUS.APPROVED,
        approval_mode: 'auto_no_approval',
        responded_at: new Date().toISOString(),
      });
      apApp.status = APPLY_STATUS.APPROVED;
      _routeToWorker(apApp);
    }

    if (typeof posthog !== 'undefined') {
      posthog.capture('pipeline_queue_auto_approved', { count: pending.length, mode: mode });
    }
    if (typeof showToast === 'function') {
      showToast(pending.length + ' application(s) submitted via autopilot.');
    }
    await loadPendingApplications();
    renderPendingApplications();
    return;
  }

  // Fallback: delegate to original processApplyQueue
  return processApplyQueue();
}

/**
 * EXT-AS-7: Bulk process queue — approve all pending apps and route to worker.
 * Called from Pipeline Process Queue button.
 */
async function processApplyQueue() {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING;
  });

  if (pending.length === 0) {
    if (typeof showToast === 'function') showToast('No pending applications to process.');
    return;
  }

  var processed = 0;
  var directCount = 0;
  var workerCount = 0;

  for (var i = 0; i < pending.length; i++) {
    var app = pending[i];

    // Set to approved
    await updatePendingApplication(app.id, {
      status: APPLY_STATUS.APPROVED,
      responded_at: new Date().toISOString(),
    });
    app.status = APPLY_STATUS.APPROVED;

    if (_isRecruiteeJob(app.job_url)) {
      // Recruitee: direct API submission
      var resume = _getActiveResume();
      var result = await callSubmitApplication(app, resume.id, resume.filename);
      if (result.ok) {
        _updatePipelineApplied(app.job_id);
        directCount++;
      }
    } else {
      // All others: worker picks up approved rows
      _routeToWorker(app);
      workerCount++;
    }
    processed++;
  }

  if (typeof showToast === 'function') {
    showToast('Processing ' + processed + ' application(s): ' +
      (directCount > 0 ? directCount + ' direct, ' : '') +
      (workerCount > 0 ? workerCount + ' queued for worker.' : ''));
  }

  if (typeof posthog !== 'undefined') {
    posthog.capture('bulk_queue_processed', {
      total: processed,
      direct_count: directCount,
      worker_count: workerCount,
      platform: 'dashboard',
    });
  }

  await loadPendingApplications();
  renderPendingApplications();
}

function loadApplySettings() {
  try {
    var raw = localStorage.getItem('bj_apply_settings');
    if (raw) userApplySettings = Object.assign({}, DEFAULT_APPLY_SETTINGS, JSON.parse(raw));
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }
}

function saveApplySettings() {
  try { localStorage.setItem('bj_apply_settings', JSON.stringify(userApplySettings)); } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  // EXT-AS-1: Background sync to Supabase for worker + extension access
  _debouncedApplySettingsSync();
}

var _applySettingsSyncTimer = null;
function _debouncedApplySettingsSync() {
  clearTimeout(_applySettingsSyncTimer);
  _applySettingsSyncTimer = setTimeout(function() {
    if (typeof syncApplySettingsToSupabase === 'function') {
      syncApplySettingsToSupabase();
    }
    if (typeof _updateApplySettingsDisplay === 'function') {
      _updateApplySettingsDisplay();
    }
  }, 2000);
}

// ─── Supabase-backed pending applications ───────────────────

async function loadPendingApplications() {
  if (!currentUser) {
    pendingApplications = [];
    return;
  }
  try {
    var { data, error } = await sb
      .from('pending_applications')
      .select('*')
      .eq('user_id', currentUser.id)
      .in('status', ['pending', 'approved', 'processing', 'failed'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[apply-workflow] Load pending apps error:', error.message);
      pendingApplications = [];
    } else {
      pendingApplications = data || [];
    }
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Load pending apps exception:', e);
    pendingApplications = [];
  }
}

async function savePendingApplication(app) {
  if (!currentUser) return null;
  try {
    var { data, error } = await sb
      .from('pending_applications')
      .insert(app)
      .select()
      .single();
    if (error) {
      console.error('[apply-workflow] Insert pending app error:', error.message);
      if (typeof showToast === 'function') showToast('Failed to save application: ' + error.message, { type: 'error' });
      return null;
    }
    return data;
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Insert pending app exception:', e);
    return null;
  }
}

async function updatePendingApplication(id, updates) {
  if (!currentUser) return false;
  try {
    var { error } = await sb
      .from('pending_applications')
      .update(updates)
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (error) {
      console.error('[apply-workflow] Update pending app error:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] Update pending app exception:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get auth token for EF calls
// ═══════════════════════════════════════════════════════════

async function _getAuthToken() {
  var session = await sb.auth.getSession();
  return session?.data?.session?.access_token || null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Call submit-application Edge Function
// Routes: Recruitee (real API), others (mock fallback)
// ═══════════════════════════════════════════════════════════

async function callSubmitApplication(pendingApp, resumeFileId, resumeFilename) {
  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return { ok: false, error: 'no_auth' };
  }

  var idempotencyKey = crypto.randomUUID();

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/submit-application', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      signal: AbortSignal.timeout(30000), // 30s client timeout
      body: JSON.stringify({
        job_id: pendingApp.job_id,
        ats_source: _guessAtsSource(pendingApp.job_url),
        ats_job_url: pendingApp.job_url || '',
        resume_file_id: resumeFileId || crypto.randomUUID(),
        resume_filename: resumeFilename || 'resume.pdf',
        resume_version: pendingApp.rewritten_resume_id ? 'rewritten' : 'original',
        rewrite_id: pendingApp.rewritten_resume_id || null,
        applicant: {
          name: currentUser.user_metadata?.full_name || currentUser.email || '',
          email: currentUser.email || '',
        },
        apply_mode: pendingApp.approval_mode || 'manual',
        score: pendingApp.original_score || null,
        was_rewritten: !!pendingApp.rewritten_resume_id,
        filter_id: pendingApp.filter_id || null,
        pending_application_id: pendingApp.id,
        idempotency_key: idempotencyKey,
      }),
    });

    var data = await res.json();

    if (res.ok) {
      return { ok: true, data: data };
    } else if (res.status === 422) {
      return { ok: false, error: 'rejected', detail: data.detail || data.error || 'Application rejected by ATS' };
    } else {
      return { ok: false, error: data.error || 'submission_failed' };
    }
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return { ok: false, error: 'timeout' };
    }
    reportError('apply_workflow', e);
    console.error('[apply-workflow] submit-application error:', e);
    return { ok: false, error: 'network_error' };
  }
}

function _guessAtsSource(url) {
  if (!url) return 'greenhouse';
  if (url.indexOf('greenhouse') >= 0) return 'greenhouse';
  if (url.indexOf('lever.co') >= 0) return 'lever';
  if (url.indexOf('ashby') >= 0) return 'ashby';
  if (url.indexOf('workable') >= 0) return 'workable';
  if (url.indexOf('recruitee') >= 0) return 'recruitee';
  if (url.indexOf('usajobs') >= 0) return 'usajobs';
  return 'greenhouse';
}

// ═══════════════════════════════════════════════════════════
// HELPER: Get active resume for current user
// ═══════════════════════════════════════════════════════════

function _getActiveResume() {
  // Check resumes module for selected resume
  if (typeof window._activeResumeId !== 'undefined' && window._activeResumeId) {
    return { id: window._activeResumeId, filename: window._activeResumeFilename || 'resume.pdf' };
  }
  // Fallback: check localStorage
  try {
    var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
    if (raw) {
      var resumes = JSON.parse(raw);
      if (resumes.length > 0) return { id: resumes[0].id || crypto.randomUUID(), filename: resumes[0].name || 'resume.pdf' };
    }
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  return { id: crypto.randomUUID(), filename: 'resume.pdf' };
}

// ═══════════════════════════════════════════════════════════
// D6: NOTIFICATION HELPER — fires apply workflow notifications
// ═══════════════════════════════════════════════════════════

async function _fireApplyNotification(type, opts) {
  if (!currentUser) return;
  var token = await _getAuthToken();
  if (!token) return;

  try {
    await fetch(SUPABASE_URL + '/functions/v1/send-notification', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify(Object.assign({
        user_id: currentUser.id,
        notification_type: type,
      }, opts)),
    });
  } catch(e) { reportError('apply-workflow', e); console.error('[apply-workflow] Notification send error:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// SCORE GATE MODAL
// ═══════════════════════════════════════════════════════════

function showScoreGateModal(jobId, jobTitle, companyName, jobUrl, scoreResult) {
  // Remove any existing modal
  var existing = document.getElementById('score-gate-modal');
  if (existing) existing.remove();

  var hasScore = scoreResult && typeof scoreResult.match_score === 'number';
  var score = hasScore ? scoreResult.match_score : null;
  var threshold = userApplySettings.default_score_threshold;
  var isAbove = hasScore && score >= threshold;

  // If score is above threshold, just proceed
  if (isAbove) {
    proceedToApply(jobId, jobTitle, companyName, jobUrl);
    return;
  }

  var scoreDisplay = hasScore ? score : '?';
  var scoreClass = hasScore ? (score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low') : 'none';
  var scoreLabel = hasScore ? (score >= 75 ? 'Strong' : score >= 50 ? 'Partial' : 'Weak') : 'Unscored';

  var breakdownHtml = '';
  if (scoreResult && scoreResult.recommendations) {
    var missing = scoreResult.recommendations.missing_skills || [];
    var strong = scoreResult.recommendations.strong_matches || [];
    breakdownHtml = '<div class="sg-breakdown">';
    if (scoreResult.analysis_summary) {
      breakdownHtml += '<div class="sg-summary">' + escapeHtml(scoreResult.analysis_summary) + '</div>';
    }
    if (strong.length > 0) {
      breakdownHtml += '<div class="sg-strong"><span class="sg-strong-label">✓ Matches:</span> ' +
        strong.slice(0, 5).map(function(s) { return '<span class="sg-strong-chip">' + escapeHtml(s) + '</span>'; }).join(' ') +
        '</div>';
    }
    if (missing.length > 0) {
      breakdownHtml += '<div class="sg-missing"><span class="sg-missing-label">Missing:</span> ' + 
        missing.map(function(s) { return '<span class="sg-missing-chip">' + escapeHtml(s) + '</span>'; }).join(' ') + 
        '</div>';
    }
    breakdownHtml += '</div>';
  }

  var modal = document.createElement('div');
  modal.id = 'score-gate-modal';
  modal.className = 'sg-overlay';
  modal.innerHTML = 
    '<div class="sg-modal">' +
      '<div class="sg-header">' +
        '<div class="sg-title">Resume Match Check</div>' +
        '<button class="sg-close" onclick="closeScoreGateModal()">&times;</button>' +
      '</div>' +
      '<div class="sg-body">' +
        '<div class="sg-job-info">' +
          '<div class="sg-job-title">' + escapeHtml(jobTitle) + '</div>' +
          '<div class="sg-job-company">' + escapeHtml(companyName) + '</div>' +
        '</div>' +
        '<div class="sg-score-row">' +
          '<div class="sg-score-badge sg-score-' + scoreClass + '">' +
            '<div class="sg-score-val">' + scoreDisplay + '</div>' +
            '<div class="sg-score-label">' + scoreLabel + '</div>' +
          '</div>' +
          '<div class="sg-threshold-info">' +
            (hasScore 
              ? 'Your resume scores <strong>' + score + '</strong> against this job. Your threshold is <strong>' + threshold + '</strong>.'
              : 'This job hasn\'t been scored against your resume yet.') +
          '</div>' +
        '</div>' +
        breakdownHtml +
      '</div>' +
      '<div class="sg-footer">' +
        '<button class="sg-btn sg-btn-secondary" onclick="closeScoreGateModal()">Cancel</button>' +
        (hasScore ? '' : '<button class="sg-btn sg-btn-accent" onclick="scoreAndRecheck(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobUrl) + '\')">Score Now (1 credit)</button>') +
        '<button class="sg-btn sg-btn-rewrite" onclick="triggerRewrite(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\')">AI Rewrite (3 credits)</button>' +
        '<button class="sg-btn sg-btn-primary" onclick="proceedToApply(\'' + escapeHtml(jobId) + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobUrl) + '\')">Apply Anyway</button>' +
      '</div>' +
      '<div class="sg-remember">' +
        '<label><input type="checkbox" id="sg-remember-check"> Don\'t show this for scores above <input type="number" id="sg-remember-val" value="' + threshold + '" min="0" max="100" style="width:48px;text-align:center;"></label>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeScoreGateModal();
  });
}

function closeScoreGateModal() {
  var modal = document.getElementById('score-gate-modal');
  if (modal) {
    // Check if user updated their threshold
    var check = document.getElementById('sg-remember-check');
    var val = document.getElementById('sg-remember-val');
    if (check && check.checked && val) {
      var newThreshold = parseInt(val.value);
      if (!isNaN(newThreshold) && newThreshold >= 0 && newThreshold <= 100) {
        userApplySettings.default_score_threshold = newThreshold;
        saveApplySettings();
      }
    }
    modal.remove();
  }
}

// ═══════════════════════════════════════════════════════════
// D5: scoreAndRecheck — Call score-resume EF (1 credit)
// ═══════════════════════════════════════════════════════════

async function scoreAndRecheck(jobId, jobTitle, companyName, jobUrl) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  // Credit check: score = 1 credit
  var ent = await checkEntitlement('resume_grading', 0);
  if (!ent.allowed) {
    if (typeof showUpgradePrompt === 'function') showUpgradePrompt('Resume Scoring', ent);
    else if (typeof showToast === 'function') showToast('Upgrade required for resume scoring.', { type: 'error' });
    return;
  }

  var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balance < 1) {
    if (typeof showToast === 'function') showToast('Scoring costs 1 credit. You have ' + (balance || 0) + '. Purchase more in Settings.', { type: 'error', duration: 5000 });
    return;
  }

  // Get active resume text
  var resume = _getActiveResume();
  var resumeText = '';
  try {
    var { data: archiveData } = await sb
      .from('resume_archive')
      .select('parsed_text')
      .eq('id', resume.id)
      .single();
    resumeText = archiveData?.parsed_text || '';
  } catch(e) { reportError('apply-workflow:apply-workflow', e); }

  if (!resumeText) {
    // Fallback: check localStorage
    try {
      var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
      if (raw) {
        var resumes = JSON.parse(raw);
        if (resumes.length > 0) resumeText = resumes[0].text || '';
      }
    } catch(e) { reportError('apply-workflow:apply-workflow', e); }
  }

  if (!resumeText) {
    if (typeof showToast === 'function') showToast('No resume text found. Upload a resume first on the Resumes page.', { type: 'error', duration: 5000 });
    return;
  }

  // Close current modal, show loading
  closeScoreGateModal();
  if (typeof showToast === 'function') showToast('Scoring your resume against this job... (1 credit)', { duration: 8000 });

  // Call score-resume EF in single mode
  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify({
        resume_text: resumeText,
        mode: 'single',
        tier: 'basic',
        job_ids: [jobId],
        resume_id: resume.id,
      }),
    });

    var data = await res.json();

    if (!res.ok || data.error) {
      if (typeof showToast === 'function') showToast('Scoring failed: ' + (data.error || 'Unknown error'), { type: 'error' });
      return;
    }

    // Cache the score for this job
    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;

    if (typeof showToast === 'function') showToast('Score: ' + (data.match_score || '?') + '/100', { duration: 3000 });

    // Re-show the Score Gate Modal with the new score
    showScoreGateModal(jobId, jobTitle || '', companyName || '', jobUrl || '', data);

  } catch (e) {
    reportError('apply_workflow', e);
    console.error('[apply-workflow] scoreAndRecheck error:', e);
    if (typeof showToast === 'function') showToast('Scoring failed. Please try again.', { type: 'error' });
  }
}

// ═══════════════════════════════════════════════════════════
// D5: triggerRewrite — Opens existing rewrite panel (3 credits)
// ═══════════════════════════════════════════════════════════

async function triggerRewrite(jobId, jobTitle, companyName) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  // Credit check: rewrite = 3 credits (Pro only)
  if (typeof _rwCanRewrite === 'function') {
    var canRewrite = await _rwCanRewrite();
    if (!canRewrite) return; // _rwCanRewrite already shows error toasts
  } else {
    // Fallback credit check if rewrite.js not loaded
    var ent = await checkEntitlement('ai_rewrite', 0);
    if (!ent.allowed) {
      if (typeof showUpgradePrompt === 'function') showUpgradePrompt('AI Resume Rewrite', ent);
      else if (typeof showToast === 'function') showToast('AI Rewrite requires Pro plan.', { type: 'error' });
      return;
    }
    var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
    if (balance < 3) {
      if (typeof showToast === 'function') showToast('Rewrite costs 3 credits. You have ' + (balance || 0) + '.', { type: 'error', duration: 5000 });
      return;
    }
  }

  closeScoreGateModal();

  // Get active resume
  var resume = _getActiveResume();
  var matchScore = null;
  if (typeof jobMatchScores !== 'undefined' && jobMatchScores[jobId]) {
    matchScore = jobMatchScores[jobId].match_score || null;
  }

  // Open the existing rewrite panel (from rewrite.js)
  if (typeof openRewritePanel === 'function') {
    openRewritePanel(jobId, jobTitle || '', companyName || '', resume.id, matchScore);
  } else {
    if (typeof showToast === 'function') showToast('Rewrite panel not available. Please reload the page.', { type: 'error' });
  }
}

// ═══════════════════════════════════════════════════════════
// D4: proceedToApply — Create pending_applications row + submit
// ═══════════════════════════════════════════════════════════

async function proceedToApply(jobId, jobTitle, companyName, jobUrl) {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  closeScoreGateModal();

  if (_applySubmitting) return;
  _applySubmitting = true;

  var mode = getApplyModeForJob(jobId);

  // ── Mode 1: Manual — just open URL, update pipeline ──
  if (mode === APPLY_MODES.MANUAL) {
    if (jobUrl) window.open(jobUrl, '_blank');
    _updatePipelineApplied(jobId);
    if (typeof showToast === 'function') showToast('Opened application page for ' + (companyName || 'this job'));
    _applySubmitting = false;
    return;
  }

  // ── Modes 2-6: Create pending_application + submit via mock ATS ──
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in to apply.', { type: 'error' });
    _applySubmitting = false;
    return;
  }

  if (typeof showToast === 'function') showToast('Submitting application...', { duration: 10000 });

  // Compute approval mode
  var approvalMode = 'manual';
  if (mode === APPLY_MODES.AUTO) approvalMode = 'auto_no_approval';
  else if (mode === APPLY_MODES.SCORE_GATED_AUTO) approvalMode = userApplySettings.default_approval_required ? 'auto_with_approval' : 'auto_no_approval';
  else if (mode === APPLY_MODES.AUTO_REWRITE) approvalMode = 'rewrite_review';
  else if (mode === APPLY_MODES.AUTOPILOT) approvalMode = 'auto_no_approval';

  // Get score if available
  var scoreResult = getScoreForJob(jobId);
  var originalScore = scoreResult ? (scoreResult.match_score || null) : null;

  // Compute expiry
  var expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (userApplySettings.auto_expire_hours || 48));

  // Get resume
  var resume = _getActiveResume();

  // Create pending_applications row
  var pendingRow = {
    user_id: currentUser.id,
    job_id: jobId,
    resume_id: resume.id,
    original_score: originalScore,
    score_result: scoreResult || null,
    status: 'approved', // Skip pending for manual apply-anyway clicks
    approval_mode: approvalMode,
    job_title: jobTitle || '',
    company_name: companyName || '',
    job_url: jobUrl || '',
    expires_at: expiresAt.toISOString(),
    idempotency_key: crypto.randomUUID(),
  };

  var savedApp = await savePendingApplication(pendingRow);
  if (!savedApp) {
    if (typeof showToast === 'function') showToast('Failed to create application record.', { type: 'error' });
    _applySubmitting = false;
    return;
  }

  // Create pipeline entry immediately so job appears on Board
  // upsert won't duplicate — keyed on user_id + job_id + ats_source
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(jobId, {
      stage: 'applied',
      title: jobTitle || '',
      companyName: companyName || '',
      company: companyName || '',
      jobUrl: jobUrl || '',
      atsSource: _guessAtsSource(jobUrl),
      appliedAt: new Date().toISOString(),
      savedAt: new Date().toISOString(),
    });
  }

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(jobUrl)) {
    // Recruitee: direct API (faster, no browser needed)
    var result = await callSubmitApplication(savedApp, resume.id, resume.filename);

    if (result.ok) {
      _updatePipelineApplied(jobId);
      if (typeof showToast === 'function') showToast('Applied to ' + (companyName || 'this job') + '!', { type: 'success' });
      _fireApplyNotification('apply_auto_submitted', {
        subject: 'Applied: ' + (jobTitle || 'Job') + ' at ' + (companyName || 'Company'),
        html: '<p>Your resume was submitted for <strong>' + escapeHtml(jobTitle || '') + '</strong> at <strong>' + escapeHtml(companyName || '') + '</strong>.</p>',
        job_id: jobId,
        job_title: jobTitle,
        company_name: companyName,
      });
    } else if (result.error === 'rejected') {
      if (typeof showToast === 'function') showToast('Application rejected: ' + (result.detail || 'Unknown reason') + '. You can retry.', { type: 'error', duration: 6000 });
    } else if (result.error === 'timeout') {
      if (typeof showToast === 'function') showToast('ATS timed out. Your application was saved — you can retry.', { type: 'error', duration: 6000 });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown error') + '. Retry from Pending Applications.', { type: 'error', duration: 6000 });
    }
  } else {
    // All other ATS: route through headless worker (AS-1/2/3)
    if (typeof showToast === 'function') showToast('Application queued — worker will submit to ' + (companyName || 'ATS') + '.', { duration: 5000 });
    await _routeToWorker(savedApp);
  }

  // Refresh pending applications list
  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

function _updatePipelineApplied(jobId) {
  // Ensure it's in pipeline
  if (typeof toggleSaveJob === 'function') {
    if (typeof savedJobIds !== 'undefined' && savedJobIds.indexOf(jobId) < 0) {
      toggleSaveJob(jobId, null);
    }
  }
  // Update pipeline stage to applied
  var meta = typeof getPipelineMeta === 'function' ? getPipelineMeta() : {};
  if (!meta[jobId]) meta[jobId] = { stage: 'applied', savedAt: new Date().toISOString() };
  meta[jobId].stage = 'applied';
  meta[jobId].appliedAt = new Date().toISOString();
  if (typeof savePipelineMeta === 'function') savePipelineMeta(meta);
}

// ═══════════════════════════════════════════════════════════
// ENHANCED APPLY BUTTON
// ═══════════════════════════════════════════════════════════

/**
 * Called when user clicks Apply on a job row.
 * Checks apply mode and score to decide whether to show gate.
 */
function handleApplyClick(jobId, jobTitle, companyName, jobUrl, btn) {
  var mode = getApplyModeForJob(jobId);
  
  if (mode === APPLY_MODES.MANUAL) {
    // Mode 1: Direct apply, no gate
    proceedToApply(jobId, jobTitle, companyName, jobUrl);
    return;
  }

  // Modes 2+: Check score — try cache first, then fetch from DB
  var scoreResult = getScoreForJob(jobId);
  if (scoreResult) {
    _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, scoreResult);
  } else {
    // Item #12: Fetch existing JD match score from DB before showing modal
    _fetchJdMatchScore(jobId).then(function(dbScore) {
      _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, dbScore);
    });
  }
}

function _handleApplyWithScore(mode, jobId, jobTitle, companyName, jobUrl, scoreResult) {
  var hasScore = scoreResult && typeof scoreResult.match_score === 'number';
  var score = hasScore ? scoreResult.match_score : null;
  var threshold = userApplySettings.default_score_threshold;

  if (mode === APPLY_MODES.SCORE_GATED) {
    if (!hasScore || score < threshold) {
      showScoreGateModal(jobId, jobTitle, companyName, jobUrl, scoreResult);
    } else {
      proceedToApply(jobId, jobTitle, companyName, jobUrl);
    }
    return;
  }

  // Modes 3-6: Auto modes (handled by auto-apply engine, not manual click)
  proceedToApply(jobId, jobTitle, companyName, jobUrl);
}

// Item #12: Fetch JD match score from resume_scores table if available
async function _fetchJdMatchScore(jobId) {
  try {
    if (!currentUser?.id) return null;
    var { data, error } = await sb
      .from('resume_scores')
      .select('match_score, analysis_summary, recommendations, scored_at')
      .eq('user_id', currentUser.id)
      .eq('job_id', jobId)
      .order('scored_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // Cache it for future use
    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;
    return data;
  } catch (e) {
    reportError('apply_workflow', e);
    console.warn('[apply-workflow] JD match fetch failed:', e);
    return null;
  }
}

function getApplyModeForJob(jobId) {
  // Check if job belongs to a filter with specific apply settings
  // For now, return the global default
  return userApplySettings.default_apply_mode || APPLY_MODES.MANUAL;
}

function getScoreForJob(jobId) {
  // Check if we have a cached score for this job
  if (typeof jobMatchScores !== 'undefined' && jobMatchScores[jobId]) {
    var s = jobMatchScores[jobId];
    if (typeof s === 'object') return s;
    if (typeof s === 'number') return { match_score: s };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// AF-003: Feed Apply Mode Routing
// ═══════════════════════════════════════════════════════════

async function handleFeedApply(jobId, jobUrl, jobData) {
  // AF-002: Setup gate
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }

  var jobTitle = (jobData && jobData.title) || '';
  var companyName = (jobData && jobData.company_name) || '';

  // PostHog
  if (typeof posthog !== 'undefined') {
    posthog.capture('feed_apply_initiated', { job_id: jobId });
  }

  // ── Step 1: Resolve resume for this job's filter ──
  var resume = _resolveResumeForJob(jobId);

  if (resume === 'no_resumes') {
    // No resumes exist → prompt upload
    _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, 'upload');
    return;
  }

  if (resume === 'no_match') {
    // Resumes exist but none assigned to this filter → show picker
    _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, 'pick');
    return;
  }

  // ── Step 2: We have a resume — submit via worker ──
  await _submitViaWorker(jobId, jobTitle, companyName, jobUrl, resume);
}

// Resolve the right resume for a job based on its matching filter
function _resolveResumeForJob(jobId) {
  var allResumes = [];
  try {
    var raw = localStorage.getItem('bj_resumes');
    if (raw && !raw.startsWith('enc:')) allResumes = JSON.parse(raw);
  } catch(e) {}
  allResumes = allResumes.filter(function(r) { return !r.archived && r.name; });

  if (allResumes.length === 0) return 'no_resumes';

  // Find which saved filters matched this job
  var feedJob = (window._feedJobMap || {})[jobId];
  var filterNums = feedJob ? (feedJob._filterNums || []) : [];
  var sf = typeof savedFilters !== 'undefined' ? savedFilters : [];

  // Try to find a resume assigned to one of the matching filters
  for (var i = 0; i < filterNums.length; i++) {
    var idx = (typeof filterNums[i].num === 'number' ? filterNums[i].num : parseInt(filterNums[i].num)) - 1;
    if (idx >= 0 && sf[idx] && sf[idx].name) {
      var filterName = sf[idx].name;
      for (var j = 0; j < allResumes.length; j++) {
        if ((allResumes[j].filterIds || []).indexOf(filterName) >= 0) {
          return { id: allResumes[j].id, filename: allResumes[j].fileName || allResumes[j].name || 'resume.pdf' };
        }
      }
    }
  }

  // No filter-specific resume — if only one resume, use it
  if (allResumes.length === 1) {
    return { id: allResumes[0].id, filename: allResumes[0].fileName || allResumes[0].name || 'resume.pdf' };
  }

  // Multiple resumes but none assigned → user needs to pick
  return 'no_match';
}

// Submit application via worker (never opens ATS directly)
async function _submitViaWorker(jobId, jobTitle, companyName, jobUrl, resume) {
  if (_applySubmitting) return;
  _applySubmitting = true;

  // Set button to "Submitting..."
  _setApplyButtonState(jobId, 'submitting');

  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in to apply.', { type: 'error' });
    _setApplyButtonState(jobId, 'retry', jobUrl);
    _applySubmitting = false;
    return;
  }

  if (typeof showToast === 'function') showToast('Submitting application to ' + (companyName || 'ATS') + '...', { duration: 10000 });

  // Get score if available
  var scoreResult = getScoreForJob(jobId);
  var originalScore = scoreResult ? (scoreResult.match_score || null) : null;

  var expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (userApplySettings.auto_expire_hours || 48));

  var pendingRow = {
    user_id: currentUser.id,
    job_id: jobId,
    resume_id: resume.id,
    original_score: originalScore,
    score_result: scoreResult || null,
    status: 'approved',
    approval_mode: 'auto_no_approval',
    job_title: jobTitle || '',
    company_name: companyName || '',
    job_url: jobUrl || '',
    expires_at: expiresAt.toISOString(),
    idempotency_key: crypto.randomUUID(),
  };

  var savedApp = await savePendingApplication(pendingRow);
  if (!savedApp) {
    if (typeof showToast === 'function') showToast('Failed to create application record. Opening ATS page.', { type: 'error' });
    _setApplyButtonState(jobId, 'retry', jobUrl);
    _applySubmitting = false;
    return;
  }

  // Pipeline entry
  if (typeof savePipelineEntry === 'function') {
    savePipelineEntry(jobId, {
      stage: 'applied', title: jobTitle || '', companyName: companyName || '', company: companyName || '',
      jobUrl: jobUrl || '', atsSource: _guessAtsSource(jobUrl), appliedAt: new Date().toISOString(), savedAt: new Date().toISOString(),
    });
  }

  // Route to worker
  try {
    if (_isRecruiteeJob(jobUrl)) {
      var result = await callSubmitApplication(savedApp, resume.id, resume.filename);
      if (result.ok) {
        _updatePipelineApplied(jobId);
        _setApplyButtonState(jobId, 'applied');
        if (typeof showToast === 'function') showToast('Applied to ' + (companyName || 'this job') + '!', { type: 'success' });
        _fireApplyNotification('apply_auto_submitted', {
          subject: 'Applied: ' + (jobTitle || 'Job') + ' at ' + (companyName || 'Company'),
          html: '<p>Your resume was submitted for <strong>' + escapeHtml(jobTitle || '') + '</strong> at <strong>' + escapeHtml(companyName || '') + '</strong>.</p>',
          job_id: jobId, job_title: jobTitle, company_name: companyName,
        });
      } else {
        if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. Click Retry to open ATS.', { type: 'error', duration: 8000 });
        _setApplyButtonState(jobId, 'retry', jobUrl);
      }
    } else {
      // All other ATS: headless worker
      await _routeToWorker(savedApp);
      _updatePipelineApplied(jobId);
      _setApplyButtonState(jobId, 'applied');
      if (typeof showToast === 'function') showToast('Application queued — submitting to ' + (companyName || 'ATS') + '.', { type: 'success', duration: 5000 });
    }
  } catch(e) {
    reportError('apply-workflow:submit', e);
    if (typeof showToast === 'function') showToast('Submission error. Click Retry to open ATS.', { type: 'error', duration: 8000 });
    _setApplyButtonState(jobId, 'retry', jobUrl);
  }

  if (typeof loadPendingApplications === 'function') await loadPendingApplications();
  if (typeof renderPendingApplications === 'function') renderPendingApplications();
  _applySubmitting = false;
}

// Update the Apply button in the feed row
function _setApplyButtonState(jobId, state, fallbackUrl) {
  var row = document.querySelector('tr.job-data-row[data-jobid="' + jobId + '"]');
  if (!row) return;
  var actionsTd = row.querySelector('.jt-actions');
  if (!actionsTd) return;
  var applyEl = actionsTd.querySelector('.apply-btn');
  if (!applyEl) return;

  if (state === 'submitting') {
    applyEl.textContent = 'Submitting…';
    applyEl.style.opacity = '0.6';
    applyEl.style.pointerEvents = 'none';
  } else if (state === 'applied') {
    applyEl.className = 'job-action-btn applied-btn';
    applyEl.textContent = 'Applied ✓';
    applyEl.style.opacity = '1';
    applyEl.style.pointerEvents = 'none';
    applyEl.removeAttribute('onclick');
    applyEl.href = '#';
  } else if (state === 'retry') {
    applyEl.textContent = 'Retry →';
    applyEl.style.opacity = '1';
    applyEl.style.pointerEvents = 'auto';
    applyEl.className = 'apply-btn apply-btn-default';
    var safeUrl = (fallbackUrl || '#').replace(/'/g, "\\'");
    applyEl.setAttribute('onclick', "event.preventDefault();window.open('" + safeUrl + "','_blank')");
  }
}

// Resume picker/upload modal
function _showResumeNeededModal(jobId, jobTitle, companyName, jobUrl, mode) {
  var existing = document.getElementById('resume-needed-modal');
  if (existing) existing.remove();

  var allResumes = [];
  try {
    var raw = localStorage.getItem('bj_resumes');
    if (raw && !raw.startsWith('enc:')) allResumes = JSON.parse(raw);
  } catch(e) {}
  allResumes = allResumes.filter(function(r) { return !r.archived && r.name; });

  var title = mode === 'upload' ? 'Upload a resume to apply' : 'Select a resume for this application';
  var body = mode === 'upload'
    ? '<p style="font-size:13px;color:var(--text-dim);margin-bottom:16px;">You need at least one resume to submit applications. Upload a resume and we\'ll submit it for you.</p>'
    + '<div style="text-align:center;"><button class="btn btn-primary btn-sm" onclick="document.getElementById(\'resume-needed-modal\').remove();document.querySelector(\'[data-page=resumes]\')?.click();">Go to Resumes →</button></div>'
    : '<p style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">No resume is assigned to the filter that matched <strong>' + escapeHtml(jobTitle) + '</strong>. Pick one to submit:</p>'
    + '<div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-bottom:16px;">'
    + allResumes.map(function(r) {
        return '<button class="btn btn-sm btn-secondary" style="text-align:left;padding:8px 14px;" '
          + 'onclick="_pickResumeAndApply(\'' + jobId + '\',\'' + escapeHtml(r.id) + '\',\'' + escapeHtml(r.fileName || r.name || 'resume.pdf').replace(/'/g, "\\'") + '\',\'' + escapeHtml(jobTitle).replace(/'/g, "\\'") + '\',\'' + escapeHtml(companyName).replace(/'/g, "\\'") + '\',\'' + (jobUrl||'').replace(/'/g, "\\'") + '\')">'
          + '<div style="font-size:12px;font-weight:600;">' + escapeHtml(r.name) + '</div>'
          + (r.filterIds && r.filterIds.length ? '<div style="font-size:10px;color:var(--text-faint);">Assigned to: ' + r.filterIds.join(', ') + '</div>' : '')
          + '</button>';
      }).join('')
    + '</div>';

  var modal = document.createElement('div');
  modal.id = 'resume-needed-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);';
  modal.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
    + '<div style="font-size:16px;font-weight:700;color:var(--text);">' + title + '</div>'
    + '<button onclick="document.getElementById(\'resume-needed-modal\').remove()" style="background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-faint);">&times;</button>'
    + '</div>'
    + body
    + '</div>';
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

// Called from resume picker modal
window._pickResumeAndApply = async function(jobId, resumeId, resumeFilename, jobTitle, companyName, jobUrl) {
  document.getElementById('resume-needed-modal')?.remove();
  await _submitViaWorker(jobId, jobTitle, companyName, jobUrl, { id: resumeId, filename: resumeFilename });
};

// AF-003: Score then auto-route (for score_gated_auto mode)
async function _scoreAndAutoRoute(jobId, jobTitle, companyName, jobUrl) {
  if (!currentUser) {
    if (typeof showToast === 'function') showToast('Please log in first.', { type: 'error' });
    return;
  }

  var ent = await checkEntitlement('resume_grading', 0);
  if (!ent.allowed) {
    if (typeof showUpgradePrompt === 'function') showUpgradePrompt('Resume Scoring', ent);
    else if (typeof showToast === 'function') showToast('Upgrade required for resume scoring.', { type: 'error' });
    return;
  }

  var { data: balance } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balance < 1) {
    if (typeof showToast === 'function') showToast('Scoring costs 1 credit. You have ' + (balance || 0) + '.', { type: 'error', duration: 5000 });
    return;
  }

  var resume = _getActiveResume();
  var resumeText = '';
  try {
    var { data: archiveData } = await sb.from('resume_archive').select('parsed_text').eq('id', resume.id).single();
    resumeText = archiveData?.parsed_text || '';
  } catch(e) { reportError('apply-workflow:_scoreAndAutoRoute', e); }

  if (!resumeText) {
    try {
      var raw = localStorage.getItem('bj_resumes'); if (raw && raw.startsWith('enc:')) raw = null;
      if (raw) { var resumes = JSON.parse(raw); if (resumes.length > 0) resumeText = resumes[0].text || ''; }
    } catch(e) { reportError('apply-workflow:_scoreAndAutoRoute', e); }
  }

  if (!resumeText) {
    if (typeof showToast === 'function') showToast('No resume text found. Upload a resume first.', { type: 'error', duration: 5000 });
    return;
  }

  if (typeof showToast === 'function') showToast('Scoring your resume... (1 credit)', { duration: 8000 });

  var token = await _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Session expired. Please log in again.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/score-resume', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ resume_text: resumeText, mode: 'single', tier: 'basic', job_ids: [jobId], resume_id: resume.id }),
    });
    var data = await res.json();

    if (!res.ok || data.error) {
      if (typeof showToast === 'function') showToast('Scoring failed: ' + (data.error || 'Unknown error'), { type: 'error' });
      return;
    }

    if (typeof jobMatchScores === 'undefined') window.jobMatchScores = {};
    jobMatchScores[jobId] = data;

    var threshold = userApplySettings.default_score_threshold;
    var score = data.match_score || 0;

    if (score >= threshold) {
      if (typeof showToast === 'function') showToast('Score ' + score + ' ≥ ' + threshold + ' — auto-applying!', { type: 'success', duration: 3000 });
      await proceedToApply(jobId, jobTitle, companyName, jobUrl);
      _trackFeedApplyComplete(jobId, 'score_gated_auto', 'auto_above_threshold');
    } else {
      if (typeof showToast === 'function') showToast('Score: ' + score + '/' + threshold + ' — below threshold.', { duration: 3000 });
      showScoreGateModal(jobId, jobTitle, companyName, jobUrl, data);
      _trackFeedApplyComplete(jobId, 'score_gated_auto', 'gate_below_threshold');
    }
  } catch (e) {
    reportError('apply-workflow:_scoreAndAutoRoute', e);
    if (typeof showToast === 'function') showToast('Scoring failed. Please try again.', { type: 'error' });
  }
}

// AF-003: PostHog tracking helper
function _trackFeedApplyComplete(jobId, mode, outcome) {
  if (typeof posthog !== 'undefined') {
    posthog.capture('feed_apply_complete', { job_id: jobId, mode: mode, outcome: outcome, surface: 'feed' });
  }
  // AF-006: Log to user_activity_log
  var feedMap = typeof window._feedJobMap !== 'undefined' ? window._feedJobMap : {};
  var jobInfo = feedMap[jobId] || {};
  logDashboardActivity('applied', {
    jobTitle: jobInfo.title || '',
    company: jobInfo.company_name || '',
    jobUrl: jobInfo.url || '',
    mode: mode,
    metadata: { outcome: outcome, surface: 'feed' }
  });
}

// AF-003: Update job card UI after apply action
function _updateFeedCardApplied(jobId) {
  var row = document.querySelector('tr[data-jobid="' + jobId + '"]');
  if (!row) return;
  var actionsCell = row.querySelector('td:last-child');
  if (actionsCell) {
    var div = actionsCell.querySelector('div');
    if (div) div.innerHTML = '<span class="job-action-btn applied-btn">Applied ✓</span>';
  }
}

// ═══════════════════════════════════════════════════════════
// PENDING APPLICATIONS PANEL
// ═══════════════════════════════════════════════════════════

function renderPendingApplications() {
  var container = document.getElementById('pending-apps-panel');
  if (!container) return;

  var pending = pendingApplications.filter(function(a) {
    return a.status === APPLY_STATUS.PENDING || a.status === APPLY_STATUS.FAILED ||
           a.status === APPLY_STATUS.APPROVED || a.status === APPLY_STATUS.PROCESSING;
  });
  
  if (pending.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  var countEl = document.getElementById('pending-apps-count');
  if (countEl) countEl.textContent = pending.length;

  var body = document.getElementById('pending-apps-body');
  if (!body) return;

  // FB-GHOST-BADGE-001: Pre-fetch ghost scores for all companies in this batch.
  // Async — we render cards immediately, then refresh once scores arrive.
  var companyNames = pending.map(function(a) { return a.company_name || ''; }).filter(Boolean);
  if (typeof loadGhostScores === 'function' && companyNames.length > 0) {
    loadGhostScores(companyNames).then(function() {
      // Re-render just the ghost badge elements without full re-render
      pending.forEach(function(app) {
        if (!app.company_name) return;
        var card = body.querySelector('.pa-card[data-app-id="' + app.id + '"]');
        if (!card) return;
        var existing = card.querySelector('.ghost-badge');
        if (existing) existing.remove();
        var companyEl = card.querySelector('.pa-job-company');
        if (companyEl && typeof buildGhostBadge === 'function') {
          var badge = buildGhostBadge(app.company_name);
          if (badge) {
            var wrapper = document.createElement('div');
            wrapper.innerHTML = badge;
            companyEl.parentNode.insertBefore(wrapper.firstChild, companyEl.nextSibling);
          }
        }
      });
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }).catch(function(e) { reportError('ghost_badge', e); });
  }

  // WAITING states that qualify for ghost badge display + self-report option
  var WAITING_STATUSES = ['pending', 'approved'];

  body.innerHTML = pending.map(function(app, i) {
    var scoreHtml = '';
    if (app.rewritten_score) {
      scoreHtml = '<span class="pa-score pa-score-improved">' + app.original_score + ' → ' + app.rewritten_score + ' (+' + (app.rewritten_score - app.original_score) + ')</span>';
    } else if (app.original_score) {
      var cls = app.original_score >= 75 ? 'high' : app.original_score >= 50 ? 'mid' : 'low';
      scoreHtml = '<span class="pa-score pa-score-' + cls + '">' + app.original_score + '</span>';
    } else {
      scoreHtml = '<span class="pa-score pa-score-none">Unscored</span>';
    }

    var statusBadge = '';
    if (app.status === APPLY_STATUS.FAILED) {
      var errorMsg = app.submission_error || 'Submission failed';
      statusBadge = '<span class="pa-badge pa-badge-failed">Failed</span>' +
        '<div style="font-size:11px;color:var(--danger);margin-top:4px;">' + escapeHtml(errorMsg) + '</div>';
    } else if (app.status === APPLY_STATUS.APPROVED) {
      statusBadge = '<span class="pa-badge" style="background:var(--warm);color:#fff;">Queued for Worker</span>';
    } else if (app.status === APPLY_STATUS.PROCESSING) {
      statusBadge = '<span class="pa-badge" style="background:var(--accent);color:#fff;">Worker Submitting...</span>';
    }

    var actionsHtml = '';
    if (app.status === APPLY_STATUS.APPROVED || app.status === APPLY_STATUS.PROCESSING) {
      actionsHtml = '<span style="font-size:11px;color:var(--muted);"><i data-lucide="loader-2" class="icon-sm" style="animation:spin 1s linear infinite;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Processing...</span>';
    } else if (app.status === APPLY_STATUS.FAILED) {
      var manualLink = app.job_url ? '<a href="' + escapeHtml(app.job_url) + '" target="_blank" class="pa-btn pa-btn-secondary" style="text-decoration:none;">Apply Manually</a>' : '';
      actionsHtml =
        manualLink +
        '<button class="pa-btn pa-btn-primary" onclick="retryPendingApp(\'' + app.id + '\')">Retry</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Dismiss</button>';
    } else if (app.approval_mode === 'rewrite_review') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approveRewrittenApp(\'' + app.id + '\')">Submit Rewritten</button>' +
        '<button class="pa-btn pa-btn-secondary" onclick="approveOriginalApp(\'' + app.id + '\')">Submit Original</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    } else if (app.approval_mode === 'auto_with_approval') {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(\'' + app.id + '\')">Approve & Submit</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    } else {
      actionsHtml = 
        '<button class="pa-btn pa-btn-primary" onclick="approvePendingApp(\'' + app.id + '\')">Apply</button>' +
        '<button class="pa-btn pa-btn-accent" onclick="scorePendingApp(\'' + app.id + '\')">Score First</button>' +
        '<button class="pa-btn pa-btn-ghost" onclick="skipPendingApp(\'' + app.id + '\')">Skip</button>';
    }

    // FB-GHOST-BADGE-001: "Report as Ghosted" added for pending/failed apps only
    var isWaiting = WAITING_STATUSES.indexOf(app.status) !== -1;
    if (isWaiting && app.company_name) {
      var daysAgo = app.created_at
        ? Math.floor((Date.now() - new Date(app.created_at).getTime()) / 86400000)
        : 0;
      actionsHtml +=
        '<button class="pa-btn pa-btn-ghost" style="font-size:10px;opacity:.7;" ' +
        'onclick="confirmGhostReport(\'' + (app.id || '') + '\',\'' + escapeHtml(app.company_name) + '\',' + daysAgo + ')">' +
        '<i data-lucide="ghost" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:3px;stroke:currentColor;fill:none;"></i>' +
        'Report Ghosted</button>';
    }

    var rewriteBadge = app.rewritten_score ? '<span class="pa-badge pa-badge-rewrite">Rewritten</span>' : '';

    // FB-GHOST-BADGE-001: Build ghost badge from cache (may be empty until async load completes)
    var ghostBadge = (isWaiting && app.company_name && typeof buildGhostBadge === 'function')
      ? buildGhostBadge(app.company_name)
      : '';

    return '<div class="pa-card" data-app-id="' + (app.id || i) + '">' +
      '<div class="pa-card-left">' +
        '<div class="pa-job-title">' + escapeHtml(app.job_title || 'Unknown Job') + '</div>' +
        '<div class="pa-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
        (ghostBadge ? ghostBadge : '') +
      '</div>' +
      '<div class="pa-card-center">' +
        scoreHtml + rewriteBadge + statusBadge +
        (app.rewrite_summary ? '<div class="pa-rewrite-summary">' + escapeHtml(app.rewrite_summary) + '</div>' : '') +
      '</div>' +
      '<div class="pa-card-actions">' + actionsHtml + '</div>' +
    '</div>';
  }).join('');

  // EXT-AS-7: Refresh Lucide icons for worker status spinners
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ═══════════════════════════════════════════════════════════
// D4: Pending Application Actions — Supabase-backed
// ═══════════════════════════════════════════════════════════

async function approvePendingApp(appId) {
  // AF-002: Setup gate — block if setup not complete
  if (!isSetupComplete()) {
    showSetupGateModal();
    return;
  }
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  // Update status to approved
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting to ' + (app.company_name || 'ATS') + '...', { duration: 10000 });
    var resume = _getActiveResume();
    var result = await callSubmitApplication(app, resume.id, resume.filename);

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Applied to ' + (app.company_name || 'job') + '!', { type: 'success' });
      _fireApplyNotification('apply_auto_submitted', {
        subject: 'Applied: ' + (app.job_title || 'Job') + ' at ' + (app.company_name || 'Company'),
        html: '<p>Your resume was submitted for <strong>' + escapeHtml(app.job_title || '') + '</strong> at <strong>' + escapeHtml(app.company_name || '') + '</strong>.</p>',
        job_id: app.job_id,
        job_title: app.job_title,
        company_name: app.company_name,
      });
    } else if (result.error === 'rejected') {
      if (typeof showToast === 'function') showToast('Rejected: ' + (result.detail || 'Unknown') + '. You can retry.', { type: 'error', duration: 6000 });
    } else if (result.error === 'timeout') {
      if (typeof showToast === 'function') showToast('ATS timed out. You can retry.', { type: 'error', duration: 6000 });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed. You can retry.', { type: 'error' });
    }
  } else {
    // Route through headless worker
    if (typeof showToast === 'function') showToast('Queued for worker submission to ' + (app.company_name || 'ATS') + '...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function approveRewrittenApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  // Use the rewritten resume
  var resumeId = app.rewritten_resume_id || app.resume_id;
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting rewritten resume...', { duration: 10000 });
    var result = await callSubmitApplication(app, resumeId, 'resume-rewritten.pdf');

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Submitted rewritten resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
      _fireApplyNotification('apply_rewrite_submitted', {
        subject: 'Applied (rewritten): ' + (app.job_title || 'Job') + ' at ' + (app.company_name || 'Company'),
        html: '<p>Your AI-rewritten resume was submitted for <strong>' + escapeHtml(app.job_title || '') + '</strong> at <strong>' + escapeHtml(app.company_name || '') + '</strong>.</p>',
        job_id: app.job_id,
        job_title: app.job_title,
        company_name: app.company_name,
      });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. You can retry.', { type: 'error' });
    }
  } else {
    if (typeof showToast === 'function') showToast('Queued rewritten resume for worker submission...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function approveOriginalApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  if (_applySubmitting) return;
  _applySubmitting = true;

  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    responded_at: new Date().toISOString(),
  });

  // EXT-AS-7: Route through worker or direct API
  if (_isRecruiteeJob(app.job_url)) {
    if (typeof showToast === 'function') showToast('Submitting original resume...', { duration: 10000 });
    var resume = _getActiveResume();
    var result = await callSubmitApplication(app, resume.id, resume.filename);

    if (result.ok) {
      _updatePipelineApplied(app.job_id);
      if (typeof showToast === 'function') showToast('Submitted original resume to ' + (app.company_name || 'job') + '!', { type: 'success' });
    } else {
      if (typeof showToast === 'function') showToast('Submission failed: ' + (result.error || 'Unknown') + '. You can retry.', { type: 'error' });
    }
  } else {
    if (typeof showToast === 'function') showToast('Queued original resume for worker submission...', { duration: 5000 });
    await _routeToWorker(app);
  }

  await loadPendingApplications();
  renderPendingApplications();
  _applySubmitting = false;
}

async function skipPendingApp(appId) {
  var success = await updatePendingApplication(appId, {
    status: APPLY_STATUS.SKIPPED,
    responded_at: new Date().toISOString(),
  });

  if (success) {
    // Remove from local array
    pendingApplications = pendingApplications.filter(function(a) { return a.id !== appId; });
    renderPendingApplications();
    if (typeof showToast === 'function') showToast('Skipped');
  } else {
    if (typeof showToast === 'function') showToast('Failed to update. Try again.', { type: 'error' });
  }
}

async function retryPendingApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;

  // Reset to approved with new idempotency key, then re-submit
  await updatePendingApplication(appId, {
    status: APPLY_STATUS.APPROVED,
    idempotency_key: crypto.randomUUID(),
  });

  // Re-fetch to get the updated row
  await loadPendingApplications();
  var updatedApp = pendingApplications.find(function(a) { return a.id === appId; });
  if (!updatedApp) return;

  await approvePendingApp(appId);
}

async function scorePendingApp(appId) {
  var app = pendingApplications.find(function(a) { return a.id === appId; });
  if (!app) return;
  // Delegate to scoreAndRecheck which handles credit check + EF call
  await scoreAndRecheck(app.job_id, app.job_title, app.company_name, app.job_url);
}

// ═══════════════════════════════════════════════════════════
// REWRITE REVIEW MODAL
// ═══════════════════════════════════════════════════════════

function showRewriteReviewModal(app) {
  var existing = document.getElementById('rewrite-review-modal');
  if (existing) existing.remove();

  var changes = app.rewrite_summary || 'No changes summary available.';
  var beforeScore = app.original_score || '?';
  var afterScore = app.rewritten_score || '?';
  var improvement = (app.rewritten_score && app.original_score) ? (app.rewritten_score - app.original_score) : 0;

  var modal = document.createElement('div');
  modal.id = 'rewrite-review-modal';
  modal.className = 'sg-overlay';
  modal.innerHTML =
    '<div class="sg-modal" style="max-width:560px;">' +
      '<div class="sg-header">' +
        '<div class="sg-title">Resume Rewrite Review</div>' +
        '<button class="sg-close" onclick="closeRewriteReviewModal()">&times;</button>' +
      '</div>' +
      '<div class="sg-body">' +
        '<div class="sg-job-info">' +
          '<div class="sg-job-title">' + escapeHtml(app.job_title || '') + '</div>' +
          '<div class="sg-job-company">' + escapeHtml(app.company_name || '') + '</div>' +
        '</div>' +
        '<div class="rr-score-comparison">' +
          '<div class="rr-score-before">' +
            '<div class="rr-score-val">' + beforeScore + '</div>' +
            '<div class="rr-score-label">Before</div>' +
          '</div>' +
          '<div class="rr-arrow">→</div>' +
          '<div class="rr-score-after">' +
            '<div class="rr-score-val">' + afterScore + '</div>' +
            '<div class="rr-score-label">After</div>' +
          '</div>' +
          (improvement > 0 ? '<div class="rr-improvement">+' + improvement + '</div>' : '') +
        '</div>' +
        '<div class="rr-changes">' +
          '<div class="rr-changes-label">Changes made:</div>' +
          '<div class="rr-changes-body">' + escapeHtml(changes) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="sg-footer">' +
        '<button class="sg-btn sg-btn-secondary" onclick="closeRewriteReviewModal()">Cancel</button>' +
        '<button class="sg-btn sg-btn-primary" onclick="submitRewrittenFromModal()">Submit Rewritten</button>' +
        '<button class="sg-btn sg-btn-ghost" onclick="submitOriginalFromModal()">Submit Original</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closeRewriteReviewModal();
  });
}

function closeRewriteReviewModal() {
  var modal = document.getElementById('rewrite-review-modal');
  if (modal) modal.remove();
}

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

loadApplySettings();

// Load pending applications from Supabase after auth is ready
(async function() {
  // Wait for auth to be ready (currentUser set by app.js)
  var attempts = 0;
  while (!window.currentUser && attempts < 20) {
    await new Promise(function(r) { setTimeout(r, 250); });
    attempts++;
  }
  if (window.currentUser) {
    await loadPendingApplications();
    renderPendingApplications();
  }
})();

// ═══════════════════════════════════════════════════════════
// MODE SELECTOR UI — wire to Rules panel buttons
// ═══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function() {
  var modeButtons = document.querySelectorAll('.app-mode-select');
  modeButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      modeButtons.forEach(function(b) {
        b.classList.remove('active');
        b.style.border = '';
      });
      btn.classList.add('active');
      btn.style.border = '2px solid var(--accent)';
      
      var mode = btn.getAttribute('data-mode');
      userApplySettings.default_apply_mode = mode;
      saveApplySettings();
      updateApplySettingsVisibility(mode);
    });
  });

  // Initialize visibility based on saved mode
  var savedMode = userApplySettings.default_apply_mode || 'manual';
  var activeBtn = document.querySelector('.app-mode-select[data-mode="' + savedMode + '"]');
  if (activeBtn) {
    modeButtons.forEach(function(b) { b.classList.remove('active'); b.style.border = ''; });
    activeBtn.classList.add('active');
    activeBtn.style.border = '2px solid var(--accent)';
  }
  updateApplySettingsVisibility(savedMode);

  // Threshold slider
  var thresholdSlider = document.getElementById('fas-threshold');
  if (thresholdSlider) {
    thresholdSlider.value = userApplySettings.default_score_threshold || 70;
    document.getElementById('fas-threshold-val').textContent = thresholdSlider.value;
    thresholdSlider.addEventListener('change', function() {
      userApplySettings.default_score_threshold = parseInt(this.value);
      saveApplySettings();
    });
  }

  // Auto-rewrite toggle shows rewrite approval options
  var rewriteToggle = document.getElementById('fas-auto-rewrite');
  if (rewriteToggle) {
    rewriteToggle.addEventListener('change', function() {
      var row = document.getElementById('fas-rewrite-approval-row');
      if (row) row.style.display = this.checked ? '' : 'none';
    });
  }
});

function updateApplySettingsVisibility(mode) {
  var scoreGate = document.getElementById('score-gate-settings');
  var approval = document.getElementById('approval-settings');
  var rewriteRow = document.getElementById('fas-rewrite-row');
  var rewriteApprovalRow = document.getElementById('fas-rewrite-approval-row');

  var usesScore = ['score_gated', 'score_gated_auto', 'auto_rewrite', 'autopilot'].indexOf(mode) >= 0;
  var usesAuto = ['auto', 'score_gated_auto', 'auto_rewrite', 'autopilot'].indexOf(mode) >= 0;
  var usesRewrite = ['auto_rewrite', 'autopilot'].indexOf(mode) >= 0;

  if (scoreGate) scoreGate.style.display = usesScore ? '' : 'none';
  if (approval) approval.style.display = usesAuto ? '' : 'none';
  if (rewriteRow) rewriteRow.style.display = usesRewrite ? '' : 'none';
  if (rewriteApprovalRow) rewriteApprovalRow.style.display = usesRewrite && document.getElementById('fas-auto-rewrite') && document.getElementById('fas-auto-rewrite').checked ? '' : 'none';
}

// EXT-AS-7: Window exports for SPA bridge + cross-module access
window.processApplyQueue = processApplyQueue;
// AF-004: Mode-aware queue processing
window.processApplyQueueByMode = processApplyQueueByMode;
window._isRecruiteeJob = _isRecruiteeJob;
window._activePollers = _activePollers;
// AF-002: Setup gate exports
window.isSetupComplete = isSetupComplete;
window.showSetupGateModal = showSetupGateModal;
window.hideSetupGateModal = hideSetupGateModal;
window.navigateToSetup = navigateToSetup;
window.checkAndSetSetupComplete = checkAndSetSetupComplete;
// AF-003: Feed apply mode routing exports
window.handleFeedApply = handleFeedApply;
window.showScoreGateModal = showScoreGateModal;
window.closeScoreGateModal = closeScoreGateModal;
window.scoreAndRecheck = scoreAndRecheck;
window.triggerRewrite = triggerRewrite;
window.proceedToApply = proceedToApply;
// AF-006: Dashboard activity logging export
window.logDashboardActivity = logDashboardActivity;

// CS-P1-004 FE-005: Register apply-workflow exports with BJ namespace
(function() {
  ['jobMatchScores'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'apply-workflow', registered: Date.now() };
    }
  });
})();

// ─────────────────────────────────────────────────────────────────────────────
// FB-GHOST-BADGE-001: Ghost Intelligence Badges
// Crowdsourced ghosting badges on My Applications cards.
// ─────────────────────────────────────────────────────────────────────────────

/* Ghost score cache: { [company_name]: { tier, effective_count, self_reported_count, auto_inferred_count } } */
var _ghostScoreCache = {};

/**
 * loadGhostScores(companyNames)
 * Batch-fetch ghost_company_scores for the given set of normalized company names.
 * Populates _ghostScoreCache. Called before rendering application cards.
 */
async function loadGhostScores(companyNames) {
  if (!currentUser || !companyNames || companyNames.length === 0) return;
  try {
    var normalized = companyNames.map(function(n) {
      return (n || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }).filter(Boolean);

    if (normalized.length === 0) return;

    var { data, error } = await sb
      .from('ghost_company_scores')
      .select('company_name, effective_count, tier, self_reported_count, auto_inferred_count')
      .in('company_name', normalized);

    if (error) { reportError('ghost_badge', error); return; }

    for (var i = 0; i < (data || []).length; i++) {
      var row = data[i];
      _ghostScoreCache[row.company_name] = row;
    }
  } catch (e) {
    reportError('ghost_badge', e);
  }
}

/**
 * buildGhostBadge(companyName)
 * Returns HTML string for the ghost intelligence badge, or '' if no data.
 * Only shown for applications in waiting states (Applied/Screening/Interview).
 */
function buildGhostBadge(companyName) {
  if (!companyName) return '';
  var key = (companyName || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  var score = _ghostScoreCache[key];
  if (!score) return '';

  var count = Math.round(parseFloat(score.effective_count) || 0);
  if (count < 1) return '';

  var tier = score.tier || 'low';
  var tierColor = tier === 'high' ? 'var(--red)' : tier === 'medium' ? 'var(--amber, #F59E0B)' : 'var(--text-faint)';
  var tierBg    = tier === 'high' ? 'rgba(220,38,38,0.1)' : tier === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(0,0,0,0.06)';

  var badgeText = tier === 'high'
    ? 'Frequent ghosting reported (' + count + ')'
    : count + ' user' + (count === 1 ? '' : 's') + ' reported no response';

  var tooltip = (score.self_reported_count || 0) + ' self-reported, ' +
    (score.auto_inferred_count || 0) + ' auto-detected — weighted score: ' + count +
    '. Reports from the last 18 months.';

  return '<span class="ghost-badge ghost-badge-' + tier + '" ' +
    'data-company="' + (typeof escapeHtml === 'function' ? escapeHtml(key) : key) + '" ' +
    'title="' + (typeof escapeHtml === 'function' ? escapeHtml(tooltip) : tooltip) + '" ' +
    'style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;' +
    'font-size:10px;font-weight:600;color:' + tierColor + ';background:' + tierBg + ';' +
    'cursor:pointer;white-space:nowrap;margin-top:4px;" ' +
    'onclick="showGhostBadgeTooltip(this)">' +
    '<i data-lucide="ghost" style="width:10px;height:10px;stroke:currentColor;fill:none;flex-shrink:0;"></i>' +
    (typeof escapeHtml === 'function' ? escapeHtml(badgeText) : badgeText) +
    '</span>';
}

/**
 * showGhostBadgeTooltip(el)
 * Show the tooltip on tap/click (for mobile where :hover isn't reliable).
 * Fires PostHog ghost_badge_tooltip_shown.
 */
function showGhostBadgeTooltip(el) {
  var company = el ? el.getAttribute('data-company') : '';
  var score = company ? _ghostScoreCache[company] : null;
  if (window.posthog) posthog.capture('ghost_badge_tooltip_shown', {
    company_name: company,
    tier: score ? score.tier : 'unknown',
  });
  // tooltip is already on the title attr; native browser handles it on desktop
  // For mobile we could add a small toast but title attr is sufficient for MVP
}

/**
 * submitGhostReport(applicationId, companyName, daysSinceApplied)
 * Fires ghost-report-submit EF after user confirms.
 */
async function submitGhostReport(applicationId, companyName, daysSinceApplied) {
  if (!currentUser) return;
  try {
    var { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    if (window.posthog) posthog.capture('ghost_self_report_initiated', {
      company_name:       companyName,
      application_id:     applicationId,
      days_since_applied: daysSinceApplied || 0,
    });

    var resp = await fetch(SUPABASE_URL + '/functions/v1/api-gateway', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'x-gateway-route': 'ghost-report-submit',
      },
      body: JSON.stringify({
        application_id:     applicationId || null,
        company_name:       companyName,
        days_since_applied: daysSinceApplied || null,
      }),
    });

    var result = await resp.json();
    if (result.already_reported) {
      if (typeof showToast === 'function') showToast('You already reported this company recently.', { type: 'info' });
      return;
    }
    if (!resp.ok) {
      if (typeof showToast === 'function') showToast('Failed to submit ghost report.', { type: 'error' });
      reportError('ghost_badge', new Error(result.error || 'submit failed'));
      return;
    }

    // Refresh badge for this company in cache
    if (result.score) {
      var key = (companyName || '').trim().toLowerCase().replace(/[,.'"\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      _ghostScoreCache[key] = result.score;
    }

    if (typeof showToast === 'function') showToast('Reported. This helps other job seekers. ✓', { type: 'success' });

    // Re-render application cards to show updated badge
    if (typeof renderPendingApplications === 'function') renderPendingApplications();

  } catch (e) {
    reportError('ghost_badge', e);
    if (typeof showToast === 'function') showToast('Failed to submit ghost report.', { type: 'error' });
  }
}

/**
 * confirmGhostReport(applicationId, companyName, daysSinceApplied)
 * Shows confirmation dialog before submitting.
 */
function confirmGhostReport(applicationId, companyName, daysSinceApplied) {
  if (window.posthog) posthog.capture('ghost_self_report_initiated', {
    company_name: companyName,
    application_id: applicationId,
    days_since_applied: daysSinceApplied || 0,
  });

  var escaped = typeof escapeHtml === 'function' ? escapeHtml(companyName) : companyName;
  if (confirm('Mark ' + escaped + ' as ghosted? This helps other job seekers find honest intel.')) {
    submitGhostReport(applicationId, companyName, daysSinceApplied);
  } else {
    if (window.posthog) posthog.capture('ghost_self_report_cancelled', { company_name: companyName });
  }
}

window.loadGhostScores = loadGhostScores;
window.buildGhostBadge = buildGhostBadge;
window.showGhostBadgeTooltip = showGhostBadgeTooltip;
window.confirmGhostReport = confirmGhostReport;
window.submitGhostReport = submitGhostReport;


// === js/referrals.js ===
// ============================================================
// REFERRALS — Referral Hub page logic
// v5.25: Phase 4 — Milestone rewards, LinkedIn referral codes, flair system
// Spec: referral-hub-redesign-spec v3 (Feb 26, 2026)
// ============================================================

(function () {
  'use strict';

  // ---- State ----
  let referralStats = null;
  let referralHistory = [];

  // ---- Tier labels — spec 3.4: intelligence/data-themed ----
  const TIER_LABELS = ['—', 'Signal', 'Source', 'Radar', 'Intel', 'Clearance'];

  // ---- Badge SVG icons (stroke-based, no emojis — spec audit) ----
  const BADGE_LABELS = {
    signal: {
      name: 'Signal', desc: 'First referral landed',
      icon: '<i data-lucide="bar-chart-3" class="icon-lg icon-stroke-lg"></i>'
    },
    source: {
      name: 'Source', desc: '3 activated referrals',
      icon: '<i data-lucide="radio" class="icon-lg icon-stroke-lg"></i>'
    },
    radar: {
      name: 'Radar', desc: 'On the network\u2019s radar',
      icon: '<i data-lucide="radar" class="icon-lg icon-stroke-lg"></i>'
    },
    intel: {
      name: 'Intel', desc: 'Feeding intel to the grid',
      icon: '<i data-lucide="flag" class="icon-lg icon-stroke-lg"></i>'
    },
    clearance: {
      name: 'Clearance', desc: 'Top clearance, inner circle',
      icon: '<i data-lucide="shield-check" class="icon-lg icon-stroke-lg"></i>'
    }
  };

  const ALL_BADGES = ['signal', 'source', 'radar', 'intel', 'clearance'];

  // ---- Init ----
  window.initReferralHub = async function () {
    const container = document.getElementById('ref-hub-content');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading referral data...</div>';

    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      if (!sb) { container.innerHTML = '<div style="padding:20px;color:var(--warm);">Unable to connect.</div>'; return; }

      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        container.innerHTML = '<div class="ref-empty">Log in to access your referral link and track earnings.</div>';
        return;
      }

      // Fetch stats via RPC
      const { data: stats, error: statsErr } = await sb.rpc('get_referral_stats', { p_user_id: user.id });
      if (statsErr) throw statsErr;
      referralStats = stats;

      // Fetch referral history
      const history = await safeQuery(() => sb.from('referrals').select('id, referred_email, attribution_method, status, fraud_score, signup_at, activated_at, rewarded_at')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50), { label: 'referrals:referrals', fallback: [] });
      referralHistory = history || [];

      renderReferralHub(container);

      // AC #1-8: Init outreach tracking log + correlation card
      await initReferralTracking();

      // Phase 4A: Check and grant any pending tier bonuses
      if (referralStats && referralStats.current_tier > 0) {
        try {
          const { data: bonusResult } = await sb.rpc('process_tier_bonus', { p_user_id: user.id });
          if (bonusResult && bonusResult.granted && bonusResult.granted.length > 0) {
            bonusResult.granted.forEach(g => {
              const parts = [`${g.credits} credits`];
              if (g.pro_days > 0) parts.push(`${g.pro_days} days Pro`);
              showToast(`${g.name} tier unlocked! You earned ${parts.join(' + ')}`, { type: 'success', duration: 6000 });
            });
          }
        } catch(bonusErr) { reportError('referrals', bonusErr); console.warn('[Referrals] Tier bonus check:', bonusErr.message);
        }
      }
    } catch (err) {
      reportError('referrals', err);
      console.error('[Referrals] Init error:', err);
      container.innerHTML = '<div class="ref-empty">Unable to load referral data. Refresh to retry.</div>';
    }
  };

  // ---- Render ----
  function renderReferralHub(container) {
    const s = referralStats;
    if (!s) return;

    const tierPct = s.progress_to_next || 0;
    const nextTierAt = s.next_tier_at;
    const remaining = nextTierAt ? nextTierAt - s.referral_count : 0;
    // Spec 3.3: /in/ format for referral links
    const refLink = s.referral_link || '';

    container.innerHTML = `
      <!-- Hero Banner — spec 3.1: .referral-hero following .feed-hero/.setup-hero pattern -->
      <div class="referral-hero">
        <div class="referral-hero-title">
          Share the signal. <span style="color:var(--warm);">Earn together.</span>
        </div>
        <div class="referral-hero-sub">
          For each friend who signs up and runs their first search: you get 7 days of Pro + 25 AI credits. They get the same.
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-val">${s.referral_count}</div>
            <div class="hero-stat-label">Referrals</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-accent">${TIER_LABELS[s.current_tier] || '\u2014'}</div>
            <div class="hero-stat-label">Current Tier</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-green">${s.stats.rewarded}</div>
            <div class="hero-stat-label">Rewards Earned</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-dim">${s.stats.total_invites}</div>
            <div class="hero-stat-label">Invites Sent</div>
          </div>
        </div>
      </div>

      <!-- Progress to Next Tier -->
      ${nextTierAt ? `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">Progress to ${TIER_LABELS[s.current_tier + 1] || 'Next Tier'}</span>
          <span style="font-size:13px;color:var(--text-dim);font-family:var(--mono);">${s.referral_count} / ${nextTierAt}</span>
        </div>
        <div class="progress-bar-bg" style="height:6px;">
          <div class="progress-bar-fill" style="width:${Math.min(tierPct, 100)}%;"></div>
        </div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:6px;">${remaining} more referral${remaining !== 1 ? 's' : ''} to unlock ${TIER_LABELS[s.current_tier + 1]} rewards</div>
      </div>
      ` : `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">Clearance \u2014 Max Tier Reached</span>
        </div>
        <div class="progress-bar-bg" style="height:6px;">
          <div class="progress-bar-fill" style="width:100%;background:var(--warm);"></div>
        </div>
      </div>
      `}

      <!-- Share Your Link — spec: "Copy Your Link" / "Copy Code" CTAs -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Share Your Link</div>
        <div style="display:flex;gap:8px;margin:12px 0;">
          <input type="text" class="ref-link-input" value="${refLink}" readonly id="ref-link-input" onclick="this.select()" />
          <button class="btn btn-primary btn-sm" onclick="window._refCopyLink()" id="ref-copy-link-btn">Copy Your Link</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;color:var(--text-dim);">
          <span>Your code:</span>
          <span style="font-family:var(--mono);font-weight:700;color:var(--accent);font-size:15px;letter-spacing:1px;" id="ref-code-val">${s.referral_code}</span>
          <button class="btn btn-secondary btn-sm" onclick="window._refCopyCode()" style="margin-left:4px;">Copy Code</button>
          <button class="btn btn-ghost btn-sm" id="ref-regenerate-btn" onclick="window.regenerateReferralCode()" style="margin-left:4px;font-size:11px;color:var(--text-faint);">Regenerate code</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="window._refShareLinkedIn()" style="display:flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window._refShareEmail()" style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="mail" class="icon-sm icon-stroke"></i>
            Email
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window._refShareSMS()" style="display:flex;align-items:center;gap:6px;">
            <i data-lucide="message-square" class="icon-sm icon-stroke"></i>
            Text
          </button>
        </div>
      </div>

      <!-- Milestones — spec 3.4: SVG icons, no emojis -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Milestones</div>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
          ${ALL_BADGES.map(b => {
            const earned = (s.badges || []).find(x => x.name === b);
            const info = BADGE_LABELS[b];
            return `
              <div style="position:relative;text-align:center;padding:16px 14px;border:1px solid ${earned ? 'var(--accent)' : 'var(--border)'};border-radius:10px;min-width:100px;flex:1;background:${earned ? 'rgba(61,130,246,0.06)' : 'transparent'};opacity:${earned ? '1' : '0.45'};">
                <div style="color:${earned ? 'var(--accent)' : 'var(--text-faint)'};margin-bottom:6px;">${info.icon}</div>
                <div style="font-size:12px;font-weight:600;">${info.name}</div>
                <div style="font-size:10px;color:var(--text-faint);margin-top:2px;">${info.desc}</div>
                ${earned ? '<div style="position:absolute;top:6px;right:8px;"><i data-lucide="check" class="icon-sm" style="stroke:var(--accent);stroke-width:3;fill:none;"></i></div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Referral History — uses admin-table pattern -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Referral History</div>
        ${referralHistory.length === 0 ?
          '<div class="ref-empty">0 referrals. Your link is ready \u2014 each activated signup earns you 7 days Pro + 25 credits.</div>' :
          `<div style="overflow-x:auto;margin-top:12px;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${referralHistory.map(r => `
                  <tr>
                    <td>${maskEmail(r.referred_email)}</td>
                    <td><span class="ref-channel-pill">${r.attribution_method}</span></td>
                    <td><span class="ref-status-pill ref-status-${r.status}">${r.status}</span></td>
                    <td>${formatDate(r.signup_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>

      <!-- Leaderboard — Phase 3: period toggle, reward grid, countdown, 20-user threshold -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div class="card-title" style="margin:0;">Leaderboard</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div id="ref-countdown" style="font-size:11px;color:var(--text-faint);font-family:var(--mono);display:flex;align-items:center;gap:4px;">
              <i data-lucide="clock" class="icon-xs icon-stroke"></i>
              <span id="ref-countdown-text"></span>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);cursor:pointer;">
              <div class="toggle-switch${s.sharing_enabled ? ' active' : ''}">
                <input type="checkbox" id="ref-optin-toggle" ${s.sharing_enabled ? 'checked' : ''} onchange="window._refToggleLeaderboard(this.checked);this.closest('.toggle-switch').classList.toggle('active',this.checked);" />
                <div class="toggle-slider"></div>
              </div>
              <span style="font-weight:500;">Show my ranking</span>
            </label>
          </div>
        </div>

        <!-- Period toggle: Weekly | Monthly — uses admin-period-btn pattern -->
        <div style="display:flex;gap:4px;margin-bottom:14px;" id="ref-period-toggle">
          <button class="admin-period-btn active" data-lb-period="weekly" onclick="window._refSwitchPeriod('weekly')">Weekly</button>
          <button class="admin-period-btn" data-lb-period="monthly" onclick="window._refSwitchPeriod('monthly')">Monthly</button>
        </div>

        <!-- Reward tier merchandising grid — spec 3.5 -->
        <div id="ref-reward-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;"></div>

        <div id="ref-leaderboard-body">
          ${s.sharing_enabled ? '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>' : '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>'}
        </div>
      </div>
    `;

    // Render reward grid and countdown for initial period
    renderRewardGrid('weekly');
    startCountdown();
    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    // Load leaderboard if opted in
    if (s.sharing_enabled) loadLeaderboard('weekly');
  }

  // ---- Share Actions — spec Section 4: rewritten share messages ----
  window._refCopyLink = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('ref-copy-link-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Your Link'; }, 2000); }
      trackInvite('copy_link');
    });
  };

  window._refCopyCode = function () {
    if (!referralStats) return;
    navigator.clipboard.writeText(referralStats.referral_code).then(() => {
      const el = document.getElementById('ref-code-val');
      if (el) { const orig = el.textContent; el.textContent = 'Copied!'; setTimeout(() => el.textContent = orig, 2000); }
      trackInvite('copy_code');
    });
  };

  // Spec Section 4 — LinkedIn share
  window._refShareLinkedIn = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link + '&utm_medium=linkedin')}`, '_blank', 'width=600,height=500');
    trackInvite('linkedin');
  };

  // Spec Section 4 — Email share
  window._refShareEmail = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
    const subject = encodeURIComponent('285K+ tracked jobs across 10K companies \u2014 free access');
    const body = encodeURIComponent(`Hey, I\u2019ve been using Brilliant Jobs \u2014 it aggregates real-time job data from 5 major ATS platforms (285K+ positions across 10K+ companies). The AI credits are useful: 25 credits is enough to score 8 resumes against live postings.

Sign up with my link and we both get 7 days of Pro + 25 credits: ${link}

Or use my code: ${referralStats.referral_code}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackInvite('email');
  };

  // Spec Section 4 — SMS share
  window._refShareSMS = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
    const msg = encodeURIComponent(`285K+ jobs tracked from 10K+ companies. Not a job board \u2014 real ATS data. Free: ${link}`);
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `sms:?body=${msg}`;
    } else {
      navigator.clipboard.writeText(decodeURIComponent(msg));
      alert('Message copied to clipboard! Paste it in your messaging app.');
    }
    trackInvite('sms');
  };

  // ---- Leaderboard state ----
  let _lbPeriod = 'weekly';
  let _countdownInterval = null;

  // ---- Reward tier definitions (spec 3.5) ----
  const REWARD_TIERS = {
    weekly: [
      { rank: '#1', credits: 50, proDays: 14, color: 'var(--warm)', gold: true },
      { rank: '#2–3', credits: 25, proDays: 7, color: '#3b82f6', gold: false },
      { rank: '#4–10', credits: 10, proDays: 0, color: '#8b5cf6', gold: false },
      { rank: 'Top 10%', credits: 5, proDays: 0, color: '#64748b', gold: false },
    ],
    monthly: [
      { rank: '#1', credits: 100, proDays: 30, color: 'var(--warm)', gold: true },
      { rank: '#2–3', credits: 50, proDays: 14, color: '#3b82f6', gold: false },
      { rank: '#4–10', credits: 25, proDays: 7, color: '#8b5cf6', gold: false },
      { rank: 'Top 25%', credits: 10, proDays: 0, color: '#64748b', gold: false },
    ]
  };

  function renderRewardGrid(period) {
    const grid = document.getElementById('ref-reward-grid');
    if (!grid) return;
    const tiers = REWARD_TIERS[period] || REWARD_TIERS.weekly;
    grid.innerHTML = tiers.map(t => `
      <div style="text-align:center;padding:12px 8px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);position:relative;${t.gold ? 'border-top:3px solid var(--warm);' : ''}">
        <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${t.color};margin-bottom:4px;">${t.rank}</div>
        <div style="font-family:var(--mono);font-size:20px;font-weight:800;color:var(--text);line-height:1;">${t.credits}</div>
        <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">credits</div>
        ${t.proDays ? `<div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${t.color}20;color:${t.color};">${t.proDays}d Pro</div>` : ''}
      </div>
    `).join('');
  }

  function startCountdown() {
    if (_countdownInterval) clearInterval(_countdownInterval);
    function update() {
      const el = document.getElementById('ref-countdown-text');
      if (!el) return;
      const now = new Date();
      let target;
      if (_lbPeriod === 'weekly') {
        // Next Monday 00:00 UTC
        target = new Date(now);
        target.setUTCHours(0, 0, 0, 0);
        const day = target.getUTCDay();
        const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
        target.setUTCDate(target.getUTCDate() + daysUntilMon);
      } else {
        // Next 1st of month 00:00 UTC
        target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      }
      const diff = target - now;
      if (diff <= 0) { el.textContent = 'Resetting...'; return; }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      el.textContent = `Resets in ${days}d ${hrs}h`;
    }
    update();
    _countdownInterval = setInterval(update, 60000);
  }

  window._refSwitchPeriod = function (period) {
    _lbPeriod = period;
    // Toggle active button
    document.querySelectorAll('#ref-period-toggle .admin-period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lbPeriod === period);
    });
    renderRewardGrid(period);
    startCountdown();
    const toggle = document.getElementById('ref-optin-toggle');
    if (toggle && toggle.checked) loadLeaderboard(period);
  };

  window._refToggleLeaderboard = async function (enabled) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      var { error: shareErr } = await sb.from('profiles').update({ sharing_enabled: enabled }).eq('id', user.id);
      if (shareErr) { reportError('referrals:toggle-leaderboard', shareErr); return; }
      if (enabled) loadLeaderboard(_lbPeriod);
      else {
        const body = document.getElementById('ref-leaderboard-body');
        if (body) body.innerHTML = '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>';
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Toggle leaderboard error:', err);
    }
  };

  async function loadLeaderboard(period) {
    const body = document.getElementById('ref-leaderboard-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>';
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();

      // Use get_leaderboard RPC (Phase 2)
      const { data, error } = await sb.rpc('get_leaderboard', {
        p_period_type: period || 'weekly',
        p_user_id: user?.id || null
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Check 20-user threshold — count opted-in users
        const { count, error: cntErr } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('sharing_enabled', true);
        if (cntErr) reportError('referrals:leaderboard-count', cntErr);
        const optedIn = count || 0;
        if (optedIn < 20) {
          body.innerHTML = `
            <div style="padding:20px;text-align:center;">
              <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${optedIn} of 20 users opted in</div>
              <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;max-width:200px;margin:0 auto;">
                <div style="height:100%;width:${Math.min((optedIn / 20) * 100, 100)}%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);border-radius:3px;transition:width .4s;"></div>
              </div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:8px;">Leaderboard activates at 20 opted-in users</div>
            </div>
          `;
        } else {
          body.innerHTML = '<div class="ref-empty">No qualifying referrals this period. Each activated referral earns you a spot.</div>';
        }
        return;
      }

      // Render leaderboard table with "Earning" column + Phase 4C flair
      body.innerHTML = `
        <table class="admin-table" style="margin-top:4px;">
          <thead><tr><th>#</th><th>Referrer</th><th>Referrals</th><th>Earning</th></tr></thead>
          <tbody>
            ${data.map(r => {
              const earningParts = [];
              if (r.earning_credits > 0) earningParts.push(`${r.earning_credits} cr`);
              if (r.earning_pro_days > 0) earningParts.push(`${r.earning_pro_days}d Pro`);
              const earning = earningParts.length ? earningParts.join(' + ') : '\u2014';
              const isMe = r.is_me;
              const tier = r.tier || 0;
              // Phase 4C: Flair based on tier
              const flairIcon = tier >= 1 ? BADGE_LABELS[ALL_BADGES[Math.min(tier - 1, 4)]]?.icon || '' : '';
              const nameStyle = tier >= 5 ? 'color:var(--warm);font-weight:700;' : tier >= 3 ? 'color:var(--accent);font-weight:600;' : '';
              const nameIcon = tier >= 1 ? `<span style="display:inline-flex;vertical-align:middle;margin-inline-end:4px;width:16px;height:16px;${tier >= 5 ? 'color:var(--warm);' : tier >= 3 ? 'color:var(--accent);' : 'color:var(--text-faint);'}">${flairIcon.replace(/width="26"/g, 'width="14"').replace(/height="26"/g, 'height="14"')}</span>` : '';
              const topBadge = tier >= 5 ? ' <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:var(--warm-dim);color:var(--warm);font-weight:700;letter-spacing:.3px;vertical-align:middle;">TOP REFERRER</span>' : '';
              return `
                <tr style="${isMe ? 'background:rgba(59,130,246,0.06);' : ''}">
                  <td style="font-family:var(--mono);font-weight:700;${r.rank === 1 ? 'color:var(--warm);' : ''}">${r.rank}</td>
                  <td style="${nameStyle}">${nameIcon}${r.display_name || 'Anonymous'}${isMe ? ' <span style="font-size:10px;color:var(--accent);font-weight:600;">(you)</span>' : ''}${topBadge}</td>
                  <td style="font-family:var(--mono);">${r.referral_count}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">${earning}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      reportError('referrals', err);
      console.error('[Referrals] Leaderboard error:', err);
      body.innerHTML = '<div class="ref-empty">Unable to load leaderboard. Refresh to retry.</div>';
    }
  }

  async function trackInvite(channel) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      var { error: invErr } = await sb.from('referral_invites').insert({
        referrer_id: user.id,
        channel: channel,
        utm_medium: channel
      });
      if (invErr) reportError('referrals:track-invite', invErr);
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Track invite error:', err);
    }
  }

  // ---- Helpers ----
  function maskEmail(email) {
    if (!email) return '\u2014';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return local.charAt(0) + '***@' + domain;
  }

  function formatDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- Post-Win Share Modal — spec: "Share the signal" + context-specific data points ----
  window.showReferralShareModal = function (context) {
    const s = referralStats;
    if (!s) return;
    const link = s.referral_link || '';

    const messages = {
      interview: `Just landed an interview. Brilliant Jobs flagged the role 3 days before it hit LinkedIn:`,
      offer: `Got the offer. Brilliant Jobs tracked the company\u2019s hiring velocity and salary range before I applied:`,
      general: `Using Brilliant Jobs to track real hiring data across 10K+ companies. Worth a look:`
    };
    const msg = messages[context] || messages.general;

    const modal = document.createElement('div');
    modal.className = 'ref-share-modal-overlay';
    modal.innerHTML = `
      <div class="ref-share-modal">
        <button class="ref-share-modal-close" onclick="this.closest('.ref-share-modal-overlay').remove()">&times;</button>
        <div class="ref-share-modal-title">Share the signal</div>
        <div class="ref-share-modal-msg">${msg}</div>
        <div class="ref-share-modal-link">${link}</div>
        <div class="ref-share-modal-actions">
          <button class="btn btn-primary" onclick="window._refCopyLink();this.textContent='Copied!'">Copy Link</button>
          <button class="btn btn-secondary" onclick="window._refShareLinkedIn()">LinkedIn</button>
          <button class="btn btn-secondary" onclick="window._refShareEmail()">Email</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

})();

// ============================================================
// REFERRAL OUTREACH TRACKING — v7.09 Pod 1 UI Layer
// Spec: HANDOFF_REFERRAL_TRACKING_POD1.docx
// AC #1-8: Log view, status controls, correlation card, PostHog
// ============================================================

(function () {
  'use strict';

  // ---- State ----
  let _outreachRows = [];
  let _correlationData = null;

  // ---- Status badge colors ----
  const STATUS_COLORS = {
    sent: '#3b82f6',
    pending: 'var(--warm)',
    accepted: 'var(--green)',
    declined: '#64748b'
  };

  // ---- Date formatter: "Mar 3" or "Mar 3, 2025" ----
  function formatOutreachDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  // ---- Status badge HTML ----
  function statusBadge(status) {
    const color = STATUS_COLORS[status] || '#64748b';
    const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${color}18;color:${color};border:1px solid ${color}30;">
      <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>${label}
    </span>`;
  }

  // ---- Channel badge HTML ----
  function channelBadge(channel) {
    const isLinkedIn = channel === 'linkedin';
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:var(--bg-input);color:var(--text-dim);">
      ${isLinkedIn
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
        : '<i data-lucide="mail" class="icon-xs icon-stroke"></i>'
      }
      ${isLinkedIn ? 'LinkedIn' : 'Email'}
    </span>`;
  }

  // ---- Render correlation card ----
  function renderCorrelationCard(data) {
    if (!data) return '';
    const totalSent = data.total_sent || 0;

    if (totalSent < 3) {
      return `
        <div class="card" style="padding:16px 20px;margin-bottom:20px;">
          <div class="card-title" style="margin-bottom:12px;">Referral vs. Cold Comparison</div>
          <div style="font-size:13px;color:var(--text-dim);text-align:center;padding:12px 0;">
            Send more outreach to unlock referral vs. cold stats.
          </div>
        </div>
      `;
    }

    const rate = data.acceptance_rate != null ? Math.round(data.acceptance_rate) : 0;
    const stats = [
      { label: 'Outreach Sent', val: totalSent, mono: true },
      { label: 'Acceptance Rate', val: `${rate}%`, mono: true, color: 'var(--green)' },
      { label: 'Applied w/ Referral', val: data.applied_with_referral || 0, mono: true, color: '#3b82f6' },
      { label: 'Applied Cold', val: data.applied_cold || 0, mono: true, color: '#64748b' }
    ];

    return `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title" style="margin-bottom:14px;">Referral vs. Cold Comparison</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
          ${stats.map(s => `
            <div style="text-align:center;">
              <div style="font-family:var(--mono);font-size:22px;font-weight:800;color:${s.color || 'var(--text)'};line-height:1.1;">${s.val}</div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:4px;line-height:1.3;">${s.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ---- Render single outreach row ----
  function renderOutreachRow(row) {
    const statusOptions = ['sent', 'pending', 'accepted', 'declined'];
    const selectOptions = statusOptions.map(s =>
      `<option value="${s}" ${row.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    const referralLinkBtn = (row.referral_link && row.referral_link.trim())
      ? `<a href="${row.referral_link}" target="_blank" rel="noopener noreferrer"
           style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;background:#2e6da4;text-decoration:none;white-space:nowrap;"
           onclick="window._trackReferralLinkClick('${row.id}')">
           Apply via referral link →
         </a>`
      : '';

    // Referral link input (shown when accepted, if no link yet)
    const linkInputHtml = (row.status === 'accepted' && !row.referral_link)
      ? `<div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
           <input type="text" placeholder="Paste referral link (optional)" 
             style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);"
             id="ref-link-input-${row.id}" />
           <button onclick="window._saveReferralLink('${row.id}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;cursor:pointer;">Save</button>
         </div>`
      : '';

    return `
      <tr data-outreach-id="${row.id}">
        <td>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${row.job_title || '—'}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px;">${row.company || '—'}</div>
        </td>
        <td>${channelBadge(row.channel)}</td>
        <td style="font-size:13px;color:var(--text-dim);">${row.their_name || '—'}</td>
        <td>
          <div id="ref-badge-${row.id}">${statusBadge(row.status)}</div>
        </td>
        <td style="font-size:12px;color:var(--text-faint);white-space:nowrap;">${formatOutreachDate(row.sent_at)}</td>
        <td>
          ${referralLinkBtn}
          <div style="${referralLinkBtn ? 'margin-top:6px;' : ''}">
            <select
              style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);cursor:pointer;"
              onchange="window._updateOutreachStatus('${row.id}', this.value, this)">
              ${selectOptions}
            </select>
          </div>
          ${linkInputHtml}
        </td>
      </tr>
    `;
  }

  // ---- Render outreach log table ----
  function renderOutreachLog(rows) {
    if (!rows || rows.length === 0) {
      return `
        <div style="text-align:center;padding:28px 16px;">
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">No outreach sent yet. Use Request Referral from any job to get started.</div>
          <button class="btn btn-secondary btn-sm" onclick="window.navigateTo && window.navigateTo('feed')">Browse Jobs →</button>
        </div>
      `;
    }

    return `
      <div style="overflow-x:auto;margin-top:12px;">
        <table class="admin-table" style="min-width:600px;">
          <thead>
            <tr>
              <th>Job / Company</th>
              <th>Channel</th>
              <th>Their Name</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderOutreachRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---- Main init function (called from initReferralHub) ----
  window.initReferralTracking = async function () {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;

    // Fetch outreach + correlation in parallel
    const [outreachResult, correlationResult] = await Promise.allSettled([
      sb.rpc('get_referral_outreach'),
      sb.rpc('get_referral_correlation')
    ]);

    _outreachRows = (outreachResult.status === 'fulfilled' && outreachResult.value.data) ? outreachResult.value.data : [];
    _correlationData = (correlationResult.status === 'fulfilled' && correlationResult.value.data) ? correlationResult.value.data : null;
    if (outreachResult.status === 'fulfilled' && outreachResult.value.error) reportError('referrals:outreach-rpc', outreachResult.value.error);
    if (correlationResult.status === 'fulfilled' && correlationResult.value.error) reportError('referrals:correlation-rpc', correlationResult.value.error);
    if (outreachResult.status === 'rejected') reportError('referrals:outreach-rejected', outreachResult.reason);
    if (correlationResult.status === 'rejected') reportError('referrals:correlation-rejected', correlationResult.reason);

    // PostHog: referral_log_viewed
    if (window.posthog) {
      window.posthog.capture('referral_log_viewed', { row_count: _outreachRows.length });
    }

    // Inject tracking section into ref-hub-content (after existing content)
    const container = document.getElementById('ref-hub-content');
    if (!container) return;

    // Remove existing tracking section if already rendered
    const existing = document.getElementById('ref-tracking-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.id = 'ref-tracking-section';
    section.innerHTML = `
      ${renderCorrelationCard(_correlationData)}
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title" style="margin-bottom:0;">Referral Outreach</div>
        <div id="ref-outreach-log">
          ${renderOutreachLog(_outreachRows)}
        </div>
      </div>
    `;
    container.appendChild(section);
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  };

  // ---- Status update handler ----
  window._updateOutreachStatus = async function (rowId, newStatus, selectEl) {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;

    const row = _outreachRows.find(r => r.id === rowId);
    const oldStatus = row ? row.status : null;

    try {
      const params = { p_outreach_id: rowId, p_new_status: newStatus };
      await sb.rpc('update_referral_status', params);

      // Update in-memory state
      if (row) row.status = newStatus;

      // Patch badge in-place
      const badgeEl = document.getElementById(`ref-badge-${rowId}`);
      if (badgeEl) badgeEl.innerHTML = statusBadge(newStatus);

      // If accepted, show referral link input inline (if no link yet)
      if (newStatus === 'accepted') {
        const tr = selectEl.closest('tr');
        if (tr && !row?.referral_link) {
          const actionCell = tr.querySelector('td:last-child');
          if (actionCell && !actionCell.querySelector(`#ref-link-input-${rowId}`)) {
            const inputWrap = document.createElement('div');
            inputWrap.style.marginTop = '6px';
            inputWrap.style.display = 'flex';
            inputWrap.style.gap = '6px';
            inputWrap.innerHTML = `
              <input type="text" id="ref-link-input-${rowId}" placeholder="Paste referral link (optional)"
                style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);" />
              <button onclick="window._saveReferralLink('${rowId}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;cursor:pointer;">Save</button>
            `;
            actionCell.appendChild(inputWrap);
          }
        }
      }

      // PostHog: referral_status_changed
      if (window.posthog) {
        window.posthog.capture('referral_status_changed', {
          old_status: oldStatus,
          new_status: newStatus,
          has_referral_link: !!(row && row.referral_link)
        });
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Status update error:', err);
    }
  };

  // ---- Save referral link after accepting ----
  window._saveReferralLink = async function (rowId) {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;
    const input = document.getElementById(`ref-link-input-${rowId}`);
    const link = input ? input.value.trim() : '';
    if (!link) return;

    try {
      await sb.rpc('update_referral_status', {
        p_outreach_id: rowId,
        p_new_status: 'accepted',
        p_referral_link: link
      });

      // Update in-memory + UI
      const row = _outreachRows.find(r => r.id === rowId);
      if (row) row.referral_link = link;

      const tr = input ? input.closest('tr') : null;
      if (tr) {
        const actionCell = tr.querySelector('td:last-child');
        if (actionCell) {
          // Replace input area with apply button
          const inputWrap = input.closest('div');
          if (inputWrap) inputWrap.remove();
          const btn = document.createElement('a');
          btn.href = link;
          btn.target = '_blank';
          btn.rel = 'noopener noreferrer';
          btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;background:#2e6da4;text-decoration:none;margin-top:6px;';
          btn.textContent = 'Apply via referral link →';
          btn.onclick = () => window._trackReferralLinkClick(rowId);
          actionCell.insertBefore(btn, actionCell.firstChild);
        }
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Save referral link error:', err);
    }
  };

  // ---- Referral link click tracker ----
  window._trackReferralLinkClick = function (rowId) {
    const row = _outreachRows.find(r => r.id === rowId);
    if (window.posthog) {
      window.posthog.capture('referral_link_clicked', {
        job_id: row ? row.job_id : null
      });
    }
  };

  // ──────────────────────────────────────────────────────────────
  // FB-TRIAL-001-S4: Post-Upgrade Referral Introduction (Part 5)
  // Called from trial-gate.js on ?upgraded=true detection.
  // Shows: (1) green success toast, (2) one-time referral intro card.
  // ──────────────────────────────────────────────────────────────
  window.showUpgradeReferralIntro = async function () {
    // (1) Success toast — green, auto-dismiss 8s
    if (typeof window.toast === 'function') {
      window.toast('Welcome to Pro! All features are now unlocked.', { type: 'success', duration: 8000 });
    } else {
      // Fallback minimal toast
      var toastEl = document.createElement('div');
      toastEl.id = 'upgrade-success-toast';
      toastEl.style.cssText = [
        'position:fixed;top:20px;right:20px;z-index:9999;',
        'background:#22C55E;color:#fff;font-weight:600;',
        'padding:12px 20px;border-radius:10px;',
        'box-shadow:0 4px 16px rgba(0,0,0,0.18);',
        'font-size:14px;max-width:360px;',
        'animation:fadeIn .2s ease;'
      ].join('');
      toastEl.textContent = 'Welcome to Pro! All features are now unlocked.';
      document.body.appendChild(toastEl);
      setTimeout(function() { if (toastEl.parentNode) toastEl.parentNode.removeChild(toastEl); }, 8000);
    }

    // PostHog
    if (window.posthog) posthog.capture('referral_intro_shown', { surface: 'post_upgrade' });

    // (2) Check localStorage — only show once
    try {
      if (localStorage.getItem('referral_intro_dismissed') === '1') return;
    } catch(e) { /* ignore */ }

    // Fetch referral_code from profiles
    var code = null;
    try {
      if (window.sb && window.currentUser) {
        var r = await sb.from('profiles').select('referral_code').eq('id', currentUser.id).single();
        code = r.data && r.data.referral_code;
      }
    } catch(e) { if (typeof reportError === 'function') reportError('referrals:intro', e); }

    var link = code ? ('https://brilliantjobs.app/r/' + code) : '';

    // Render intro card
    var card = document.getElementById('referral-intro-card');
    if (!card) return; // Container must exist in dashboard.html

    card.innerHTML = [
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">',
        '<div style="font-weight:700;font-size:14px;color:var(--text);">',
          '<i data-lucide="gift" style="width:15px;height:15px;vertical-align:-2px;margin-right:6px;" class="icon-stroke"></i>',
          'Know someone searching for a job?',
        '</div>',
        '<button onclick="window._dismissReferralIntro()" aria-label="Dismiss" ',
          'style="background:none;border:none;cursor:pointer;color:var(--text-faint);font-size:16px;padding:0 0 0 12px;">&times;</button>',
      '</div>',
      '<div style="font-size:13px;color:var(--text-dim);margin-bottom:12px;">',
        "Share your link and you'll both get a free week when they subscribe.",
      '</div>',
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
        '<button class="btn btn-primary btn-sm" onclick="window._introcopyreferrallink()" id="intro-copy-link-btn">',
          '<i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;" class="icon-stroke"></i>',
          'Copy referral link',
        '</button>',
        '<button class="btn btn-secondary btn-sm" onclick="window._dismissReferralIntro()">Not now</button>',
      '</div>'
    ].join('');

    card.style.display = 'block';
    card.dataset.referralLink = link;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  };

  window._introcopyreferrallink = function () {
    var card = document.getElementById('referral-intro-card');
    var link = (card && card.dataset.referralLink) || '';
    if (!link) return;
    try {
      navigator.clipboard.writeText(link).then(function() {
        var btn = document.getElementById('intro-copy-link-btn');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(function() { btn.innerHTML = '<i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;" class="icon-stroke"></i>Copy referral link'; if (typeof window.refreshIcons === 'function') window.refreshIcons(); }, 2000); }
        if (window.posthog) posthog.capture('referral_link_copied', { surface: 'intro_card' });
      });
    } catch(e) { if (typeof reportError === 'function') reportError('referrals:copy', e); }
  };

  window._dismissReferralIntro = function () {
    var card = document.getElementById('referral-intro-card');
    if (card) card.style.display = 'none';
    try { localStorage.setItem('referral_intro_dismissed', '1'); } catch(e) { /* ignore */ }
    if (window.posthog) posthog.capture('referral_intro_dismissed', { surface: 'intro_card' });
  };

  // ──────────────────────────────────────────────────────────────
  // FB-TRIAL-001-S4: Referral Code Regeneration (Part 7)
  // Called from Settings > Referrals section "Regenerate code" button.
  // ──────────────────────────────────────────────────────────────
  window.regenerateReferralCode = async function () {
    if (!window.currentUser || !window.sb) return;
    var btn = document.getElementById('ref-regenerate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Regenerating...'; }

    try {
      // Generate new 8-char code
      var newCode = Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
      newCode = newCode.slice(0, 8);

      var { error } = await sb.from('profiles').update({
        referral_code: newCode,
        referral_code_generated_at: new Date().toISOString(),
      }).eq('id', currentUser.id);

      if (error) throw error;

      // Update UI
      var codeEl = document.getElementById('ref-code-val');
      if (codeEl) codeEl.textContent = newCode;
      var linkEl = document.getElementById('ref-link-val');
      if (linkEl) linkEl.textContent = 'brilliantjobs.app/r/' + newCode;
      if (referralStats) {
        referralStats.referral_code = newCode;
        referralStats.referral_link = 'https://brilliantjobs.app/r/' + newCode;
      }

      if (typeof window.toast === 'function') {
        window.toast('Referral code regenerated!', { type: 'success', duration: 3000 });
      }
      if (window.posthog) posthog.capture('referral_code_regenerated', { surface: 'settings' });

    } catch(e) {
      if (typeof reportError === 'function') reportError('referrals:regenerate', e);
      if (typeof window.toast === 'function') {
        window.toast('Failed to regenerate code. Please try again.', { type: 'error', duration: 4000 });
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Regenerate code'; }
    }
  };

  // ──────────────────────────────────────────────────────────────
  // FB-TRIAL-001-S4: Sidebar Referral Link visibility (Part 6)
  // Called from init() — shows sidebar link for active_pro users only.
  // ──────────────────────────────────────────────────────────────
  window.initSidebarReferralLink = function (userState) {
    var linkEl = document.getElementById('sidebar-referral-link');
    if (!linkEl) return;
    if (userState === 'active_pro') {
      linkEl.style.display = 'flex';
    } else {
      linkEl.style.display = 'none';
    }
  };

  // CS-P1-004 FE-005: Register referrals.js exports with BJ namespace
  [
    'initReferralHub', '_refCopyLink', '_refCopyCode', '_refShareLinkedIn',
    '_refShareEmail', '_refShareSMS', '_refSwitchPeriod', '_refToggleLeaderboard',
    'showReferralShareModal', 'initReferralTracking', '_updateOutreachStatus',
    '_saveReferralLink', '_trackReferralLinkClick',
    // FB-TRIAL-001-S4
    'showUpgradeReferralIntro', '_introcopyreferrallink', '_dismissReferralIntro',
    'regenerateReferralCode', 'initSidebarReferralLink'
  ].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'referrals', registered: Date.now() };
    }
  });

})();


// === js/referral-outreach.js ===
/**
 * Brilliant Jobs — Referral Outreach v7.09
 * Part 1: Referral Request Templates (LinkedIn DM + Email)
 * Spec: pod1-referral-feature-brief.docx (March 2026)
 * PostHog events: referral_template_opened, referral_template_sent
 */

// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════

var REFERRAL_TEMPLATES = {
  linkedin: {
    label: 'LinkedIn DM',
    subject: null,
    body: function(vars) {
      return [
        'Hey [THEIR_NAME],',
        '',
        'Hope things are going well on your end.' + (vars.customContext ? ' ' + vars.customContext : ''),
        '',
        'I came across an opening at [COMPANY] — [JOB_TITLE] — and it looks like a strong fit for where I am in my career right now. I noticed you work there and thought I\'d reach out before applying cold.',
        '',
        'Would you be open to sharing any perspective on the team or the role? And if it feels right to you, I\'d genuinely appreciate a referral. No pressure either way — just wanted to connect first.',
        '',
        'Thanks so much,',
        '[YOUR_NAME]'
      ].join('\n')
       .replace(/\[THEIR_NAME\]/g, vars.theirName || '[Their Name]')
       .replace(/\[YOUR_NAME\]/g, vars.yourName || '[Your Name]')
       .replace(/\[COMPANY\]/g, vars.company || '[Company]')
       .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]');
    }
  },
  email: {
    label: 'Email',
    subject: function(vars) {
      return 'Quick note — [JOB_TITLE] role at [COMPANY]'
        .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]')
        .replace(/\[COMPANY\]/g, vars.company || '[Company]');
    },
    body: function(vars) {
      return [
        'Hi [THEIR_NAME],',
        '',
        'I hope you\'re doing well.' + (vars.customContext ? ' ' + vars.customContext : ''),
        '',
        'I\'m currently exploring new opportunities and came across the [JOB_TITLE] position at [COMPANY]. Given your experience there, I wanted to reach out directly rather than apply cold.',
        '',
        'If you\'re open to it, I\'d love to hear your take on the team and the role — and if it seems like a good fit from your end, a referral would mean a lot. Totally understand if that\'s not something you\'re comfortable with.',
        '',
        'Either way, happy to catch up soon.',
        '',
        'Best,',
        '[YOUR_NAME]'
      ].join('\n')
       .replace(/\[THEIR_NAME\]/g, vars.theirName || '[Their Name]')
       .replace(/\[YOUR_NAME\]/g, vars.yourName || '[Your Name]')
       .replace(/\[COMPANY\]/g, vars.company || '[Company]')
       .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]');
    }
  }
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

var _referralOutreachJob = null;
var _referralOutreachChannel = 'linkedin';

// ═══════════════════════════════════════════════════════════
// OPEN MODAL
// ═══════════════════════════════════════════════════════════

function openReferralOutreachModal(jobId) {
  // Resolve job from cache
  var job = (window.allJobs || []).find(function(j) { return j.greenhouse_id === jobId; });
  _referralOutreachJob = job || { greenhouse_id: jobId, title: '', company_name: '' };
  _referralOutreachChannel = 'linkedin';

  // Pre-fill user name from auth
  var userName = '';
  try {
    var session = window.bjSupabase && window.bjSupabase.auth && window.bjSupabase.auth.getSession
      ? null : null;
    if (window._bjUserEmail) userName = window._bjUserEmail.split('@')[0];
  } catch(e) { reportError('referral-outreach:referral-outreach', e); }

  // Render modal
  var modal = document.getElementById('referral-outreach-modal');
  if (!modal) return;

  document.getElementById('ro-job-label').textContent =
    (_referralOutreachJob.title || 'this role') + ' at ' + (_referralOutreachJob.company_name || 'this company');

  document.getElementById('ro-your-name').value = userName;
  document.getElementById('ro-their-name').value = '';
  document.getElementById('ro-custom-context').value = '';

  // Set channel tabs
  document.querySelectorAll('.ro-channel-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.channel === 'linkedin');
  });

  renderReferralTemplate();

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // PostHog
  if (window.posthog) {
    posthog.capture('referral_template_opened', {
      job_id: jobId,
      company: _referralOutreachJob.company_name,
      job_title: _referralOutreachJob.title
    });
  }
}

function closeReferralOutreachModal(e) {
  if (e && e.target !== document.getElementById('referral-outreach-modal')) return;
  _closeReferralModal();
}

function _closeReferralModal() {
  var modal = document.getElementById('referral-outreach-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE RENDERING
// ═══════════════════════════════════════════════════════════

function renderReferralTemplate() {
  var job = _referralOutreachJob || {};
  var vars = {
    theirName:     (document.getElementById('ro-their-name') || {}).value || '[Their Name]',
    yourName:      (document.getElementById('ro-your-name') || {}).value || '[Your Name]',
    company:       job.company_name || '[Company]',
    jobTitle:      job.title || '[Job Title]',
    customContext: ((document.getElementById('ro-custom-context') || {}).value || '').trim()
  };

  var tpl = REFERRAL_TEMPLATES[_referralOutreachChannel];
  if (!tpl) return;

  var bodyEl = document.getElementById('ro-template-body');
  if (bodyEl) bodyEl.value = tpl.body(vars);

  var subjectRow = document.getElementById('ro-subject-row');
  var subjectEl = document.getElementById('ro-template-subject');
  if (tpl.subject) {
    if (subjectRow) subjectRow.style.display = '';
    if (subjectEl) subjectEl.value = tpl.subject(vars);
  } else {
    if (subjectRow) subjectRow.style.display = 'none';
  }

  // Update send button label
  var sendBtn = document.getElementById('ro-send-btn');
  if (sendBtn) {
    sendBtn.textContent = _referralOutreachChannel === 'linkedin'
      ? 'Copy + Open LinkedIn'
      : 'Copy + Open Mail';
  }
}

function switchReferralChannel(channel) {
  _referralOutreachChannel = channel;
  document.querySelectorAll('.ro-channel-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.channel === channel);
  });
  renderReferralTemplate();
}

// ═══════════════════════════════════════════════════════════
// SEND ACTION
// ═══════════════════════════════════════════════════════════

function sendReferralTemplate() {
  var body = (document.getElementById('ro-template-body') || {}).value || '';
  var subject = (document.getElementById('ro-template-subject') || {}).value || '';
  var theirName = (document.getElementById('ro-their-name') || {}).value || '';
  var job = _referralOutreachJob || {};

  // Copy to clipboard
  var textToCopy = _referralOutreachChannel === 'email' && subject
    ? 'Subject: ' + subject + '\n\n' + body
    : body;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy);
  } else {
    // Fallback for older browsers
    var ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) { reportError('referral-outreach:referral-outreach', e); }
    document.body.removeChild(ta);
  }

  // Persist outreach record (fire-and-forget)
  (async function() {
    try {
      var sb = window.bjSupabase;
      if (!sb) return;
      var { error: rpcErr } = await sb.rpc('upsert_referral_outreach', {
        p_job_id: String(job.greenhouse_id || ''),
        p_company: job.company_name || '',
        p_job_title: job.title || '',
        p_channel: _referralOutreachChannel,
        p_their_name: theirName || null,
        p_status: 'sent'
      });
      if (rpcErr) reportError('referral-outreach:upsert', rpcErr);
      if (window.posthog) {
        posthog.capture('referral_saved', {
          job_id: job.greenhouse_id,
          channel: _referralOutreachChannel,
          status: 'sent'
        });
      }
    } catch(e) { reportError('referral-outreach:silent --- do not break send flow', e); }
  })();

  // Open destination
  if (_referralOutreachChannel === 'linkedin') {
    window.open('https://www.linkedin.com/messaging/', '_blank', 'noopener');
  } else {
    var mailtoSubject = encodeURIComponent(subject);
    var mailtoBody = encodeURIComponent(body);
    window.open('mailto:?subject=' + mailtoSubject + '&body=' + mailtoBody, '_blank');
  }

  // Show confirmation
  var sendBtn = document.getElementById('ro-send-btn');
  if (sendBtn) {
    var orig = sendBtn.textContent;
    sendBtn.textContent = 'Copied ✓';
    sendBtn.disabled = true;
    setTimeout(function() {
      sendBtn.textContent = orig;
      sendBtn.disabled = false;
    }, 2000);
  }

  // PostHog
  if (window.posthog) {
    posthog.capture('referral_template_sent', {
      job_id: job.greenhouse_id,
      company: job.company_name,
      job_title: job.title,
      channel: _referralOutreachChannel,
      has_their_name: !!theirName,
      has_custom_context: !!((document.getElementById('ro-custom-context') || {}).value || '').trim()
    });
  }
}


// === js/payl.js ===
/**
 * payl.js — Pay After You Land Dashboard UI
 * Session: FB-PAYL-S2
 * Depends on: tier-gating.js (isPaylUser, getUserTier), billing.js, referrals.js
 *
 * Provides:
 * - PAYL enrollment modal (3-step: PDF upload → card auth → confirmation)
 * - LinkedIn PDF upload widget (drag-and-drop + file picker)
 * - Referral progress dashboard widget
 * - Employment self-report flow (nudge + confirmation)
 * - PostHog event instrumentation (12 events per FB-PAYL-001 Section 6.4)
 * - Stripe setup_intent integration (card on file without charge)
 */

// ─── PostHog PAYL event helper ───
function _paylEvent(eventName, props) {
  try {
    if (typeof posthog !== 'undefined' && posthog.capture) {
      posthog.capture('payl_' + eventName, Object.assign({ tier: 'payl' }, props || {}));
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_posthog', e, { event: eventName });
  }
}

// ─── PAYL state ───
var _paylEnrollment = null;
var _paylReferrals = [];
var _paylStep = 0; // 0=not started, 1=pdf, 2=card, 3=done
var _paylUploadInProgress = false;

// ─── Initialize PAYL UI ───
async function initPayl() {
  if (typeof window.isPaylUser !== 'function') return;

  try {
    // Load enrollment data for PAYL users
    if (window.isPaylUser()) {
      await _loadPaylEnrollment();
      _renderReferralWidget();
      _checkEmploymentNudge();
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_init', e);
  }
}

// ─── Load PAYL enrollment from DB ───
async function _loadPaylEnrollment() {
  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) return;
    var user = (await sb.auth.getUser()).data?.user;
    if (!user) return;

    var { data, error } = await sb
      .from('payl_enrollments')
      .select('*, payl_referrals(*)')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      if (typeof reportError === 'function') reportError('payl_load', error);
      return;
    }

    if (data) {
      _paylEnrollment = data;
      _paylReferrals = data.payl_referrals || [];
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_load', e);
  }
}

// ─── PAYL Tier Card (called from billing.js) ───
function getPaylTierCard(currentTier) {
  var isPaul = currentTier === 'payl';
  return {
    id: 'payl',
    name: 'Pay After You Land',
    price: 0,
    credits: 300,
    payg: 10,
    features: [
      'Full Pro features — $0 upfront',
      'Pay only when you land a job',
      'Upload LinkedIn PDF to verify',
      '3 referrals to keep access',
      '180-day access window'
    ],
    isCurrent: isPaul,
    isPayl: true
  };
}

// ─── Render PAYL tier card HTML ───
function renderPaylTierCard(currentTier) {
  var isPayl = currentTier === 'payl';
  var highlight = !isPayl ? ' sub-tier-highlight' : '';
  return `
    <div class="sub-tier-card sub-tier-payl${isPayl ? ' sub-tier-current' : ''}${highlight}" style="display:flex;flex-direction:column;border:2px solid var(--accent);position:relative;">
      ${isPayl ? '<div class="sub-tier-badge">Current</div>' : '<div class="sub-tier-badge" style="background:var(--accent);color:#fff;">Popular</div>'}
      <div class="sub-tier-name">Pay After You Land</div>
      <div class="sub-tier-price">$0<span class="sub-tier-interval"> upfront</span></div>
      <div class="sub-tier-credits">Full Pro features</div>
      <div class="sub-tier-payg" style="color:var(--accent);font-weight:600;">Pay when you get hired</div>
      <ul class="sub-tier-features" style="flex:1;">
        <li>All Pro filters &amp; tools</li>
        <li>AI resume scoring &amp; rewrites</li>
        <li>Upload LinkedIn PDF to verify</li>
        <li>Refer 3 friends to qualify</li>
        <li>180-day access window</li>
      </ul>
      <div style="margin-top:auto;text-align:center;">
        ${isPayl
          ? '<button class="btn-secondary btn-sm" disabled>Current Plan</button>'
          : currentTier === 'pro'
            ? ''
            : '<button class="btn-primary btn-sm" onclick="openPaylEnrollment()" style="background:var(--accent);">Get Started — Free</button>'
        }
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// ENROLLMENT MODAL (3-step flow)
// ═══════════════════════════════════════════════

function openPaylEnrollment() {
  _paylStep = 1;
  _paylEvent('enrollment_started');

  var modal = document.getElementById('payl-enrollment-modal');
  if (modal) {
    modal.classList.remove('u-hidden');
    _renderEnrollmentStep();
    return;
  }

  // Create modal if first time
  var overlay = document.createElement('div');
  overlay.id = 'payl-enrollment-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:520px;padding:0;overflow:hidden;">
      <div class="payl-modal-header" style="background:var(--accent);color:#fff;padding:20px 24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:16px;font-weight:700;">Pay After You Land</h3>
          <button onclick="closePaylEnrollment()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;">&times;</button>
        </div>
        <div class="payl-steps" style="display:flex;gap:8px;margin-top:12px;">
          <div class="payl-step-dot" data-step="1" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
          <div class="payl-step-dot" data-step="2" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
          <div class="payl-step-dot" data-step="3" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
        </div>
      </div>
      <div id="payl-modal-body" style="padding:24px;"></div>
    </div>`;
  document.body.appendChild(overlay);
  _renderEnrollmentStep();
}

function closePaylEnrollment() {
  var modal = document.getElementById('payl-enrollment-modal');
  if (modal) modal.classList.add('u-hidden');
}

function _renderEnrollmentStep() {
  var body = document.getElementById('payl-modal-body');
  if (!body) return;

  // Update step dots
  document.querySelectorAll('.payl-step-dot').forEach(function(dot) {
    var step = parseInt(dot.getAttribute('data-step'));
    dot.style.background = step <= _paylStep ? '#fff' : 'rgba(255,255,255,0.3)';
  });

  if (_paylStep === 1) {
    body.innerHTML = _renderPdfUploadStep();
  } else if (_paylStep === 2) {
    body.innerHTML = _renderCardAuthStep();
    // Lazy-load Stripe.js and mount card element
    _mountPaylCardElement();
  } else if (_paylStep === 3) {
    body.innerHTML = _renderConfirmationStep();
  }
}

// ─── Step 1: LinkedIn PDF Upload ───
function _renderPdfUploadStep() {
  return `
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Step 1: Verify Your Identity</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">Upload a PDF export of your LinkedIn profile</div>
    </div>
    <div id="payl-pdf-dropzone"
         ondragover="event.preventDefault();this.classList.add('payl-drop-active');"
         ondragleave="this.classList.remove('payl-drop-active');"
         ondrop="event.preventDefault();this.classList.remove('payl-drop-active');handlePaylPdfDrop(event);"
         style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:border-color 0.2s;"
         onclick="document.getElementById('payl-pdf-input').click();">
      <div style="margin-bottom:8px;"><i data-lucide="upload" class="icon-xl icon-stroke" style="stroke:var(--accent);"></i></div>
      <div style="font-size:13px;font-weight:600;">Drag & drop your LinkedIn PDF here</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">or click to browse (PDF only, max 10MB)</div>
      <input type="file" id="payl-pdf-input" accept="application/pdf" style="display:none;" onchange="handlePaylPdfSelect(event)">
    </div>
    <div id="payl-pdf-status" style="margin-top:12px;text-align:center;font-size:12px;"></div>
    <div id="payl-pdf-preview" class="u-hidden" style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Parsed Profile Preview</div>
      <div id="payl-pdf-fields"></div>
      <div style="margin-top:12px;text-align:center;">
        <button class="btn-primary btn-sm" onclick="confirmPaylPdf()">Looks Good — Continue</button>
      </div>
    </div>
    <div style="margin-top:12px;text-align:center;">
      <a href="https://www.linkedin.com/help/linkedin/answer/a566336" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);">How to export your LinkedIn profile as PDF</a>
    </div>`;
}

// ─── PDF drag-and-drop handler ───
function handlePaylPdfDrop(event) {
  var files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    _processPaylPdf(files[0]);
  }
}

function handlePaylPdfSelect(event) {
  var files = event.target?.files;
  if (files && files.length > 0) {
    _processPaylPdf(files[0]);
  }
}

async function _processPaylPdf(file) {
  var statusEl = document.getElementById('payl-pdf-status');
  if (!statusEl) return;

  // Validate
  if (file.type !== 'application/pdf') {
    statusEl.innerHTML = '<span style="color:var(--warm);">Please upload a PDF file</span>';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    statusEl.innerHTML = '<span style="color:var(--warm);">File must be under 10MB</span>';
    return;
  }

  if (_paylUploadInProgress) return;
  _paylUploadInProgress = true;
  statusEl.innerHTML = '<span style="color:var(--accent);">Uploading and parsing...</span>';

  _paylEvent('pdf_uploaded');

  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) throw new Error('No Supabase client');
    var user = (await sb.auth.getUser()).data?.user;
    if (!user) throw new Error('Not authenticated');

    // Upload to Supabase Storage
    var path = user.id + '/linkedin-profile.pdf';
    var { error: uploadError } = await sb.storage
      .from('linkedin-profiles')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });

    if (uploadError) throw uploadError;

    // Call parse-linkedin-pdf EF via gateway
    var { data: parseResult, error: parseError } = await sb.functions.invoke('api-gateway', {
      body: { route: 'parse-linkedin-pdf', action: 'parse', user_id: user.id, pdf_path: path }
    });

    if (parseError) throw parseError;

    var parsed = typeof parseResult === 'string' ? JSON.parse(parseResult) : parseResult;

    if (parsed.error) {
      _paylEvent('pdf_rejected', { reason: parsed.error });
      statusEl.innerHTML = '<span style="color:var(--warm);">' + (parsed.error || 'Failed to parse PDF') + '</span>';
      _paylUploadInProgress = false;
      return;
    }

    _paylEvent('pdf_parsed', { field_count: Object.keys(parsed.profile || {}).length });

    // Show preview
    var preview = document.getElementById('payl-pdf-preview');
    var fields = document.getElementById('payl-pdf-fields');
    if (preview && fields) {
      var profile = parsed.profile || {};
      fields.innerHTML = [
        _pdfField('Name', profile.name),
        _pdfField('Headline', profile.headline),
        _pdfField('Location', profile.location),
        _pdfField('Experience', (profile.experience || []).length + ' entries'),
        _pdfField('Skills', (profile.skills || []).length + ' listed'),
        _pdfField('Connections', profile.connections || 'N/A')
      ].join('');
      preview.classList.remove('u-hidden');
      statusEl.innerHTML = '<span style="color:hsl(142,60%,40%);">PDF parsed successfully</span>';
    }

    // Store parsed data for next step
    window._paylParsedProfile = parsed.profile;
    window._paylPdfPath = path;
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_pdf_upload', e);
    statusEl.innerHTML = '<span style="color:var(--warm);">Upload failed. Please try again.</span>';
  }

  _paylUploadInProgress = false;
  // Refresh Lucide icons for the upload area
  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

function _pdfField(label, value) {
  return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">' +
    '<span style="color:var(--text-dim);">' + label + '</span>' +
    '<span style="font-weight:500;">' + (value || '—') + '</span></div>';
}

function confirmPaylPdf() {
  _paylStep = 2;
  _renderEnrollmentStep();
}

// ─── Step 2: Card Authorization (Stripe setup_intent) ───
function _renderCardAuthStep() {
  return `
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Step 2: Authorize Payment Method</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">Add a card on file. You won't be charged until you land a job.</div>
    </div>
    <div style="padding:16px;background:var(--bg-input);border-radius:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <i data-lucide="shield-check" class="icon-md icon-stroke" style="stroke:hsl(142,60%,40%);"></i>
        <span style="font-size:12px;font-weight:500;color:hsl(142,60%,30%);">No charge today — card stored securely via Stripe</span>
      </div>
      <div id="payl-card-element" style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;min-height:44px;">
        <!-- Stripe Elements card input mounts here -->
        <div style="font-size:12px;color:var(--text-dim);text-align:center;padding:8px;">Loading payment form...</div>
      </div>
      <div id="payl-card-error" style="margin-top:8px;font-size:11px;color:var(--warm);"></div>
    </div>
    <div style="text-align:center;">
      <button class="btn-primary" id="payl-authorize-btn" onclick="authorizePaylCard()" style="min-width:200px;">
        Authorize Card — No Charge
      </button>
    </div>
    <div style="margin-top:12px;text-align:center;font-size:11px;color:var(--text-faint);">
      Your card will only be charged when you confirm you've landed a job, or when your 180-day window expires (if card on file).
    </div>`;
}

// ─── Stripe.js lazy-load + Elements mount ───
var _stripeInstance = null;
var _cardElement = null;

function _loadStripeJs() {
  return new Promise(function(resolve) {
    if (typeof Stripe !== 'undefined') return resolve(Stripe);
    var script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = function() { resolve(Stripe); };
    script.onerror = function() { resolve(null); };
    document.head.appendChild(script);
  });
}

async function _mountPaylCardElement() {
  var StripeClass = await _loadStripeJs();
  if (!StripeClass) return;
  _stripeInstance = StripeClass('pk_live_51T3TKnPKzCZbw3KzvE3xlxz8Yt9Hx9PTIRewh21Pks8YQt6TgV5urss7w93Hd27vfnZQlMiAvMP9WAgRSHM3dFFz00ufrYmhyI');
  var elements = _stripeInstance.elements();
  _cardElement = elements.create('card', {
    style: {
      base: { fontSize: '14px', color: 'var(--text)', '::placeholder': { color: 'var(--text-dim)' } },
      invalid: { color: 'var(--warm)' }
    }
  });
  var container = document.getElementById('payl-card-element');
  if (container) {
    container.innerHTML = '';
    _cardElement.mount('#payl-card-element');
  }
}

async function authorizePaylCard() {
  var btn = document.getElementById('payl-authorize-btn');
  var errorEl = document.getElementById('payl-card-error');
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = 'Authorizing...';

  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) throw new Error('No Supabase client');

    // Ensure Stripe.js + card element mounted
    if (!_stripeInstance || !_cardElement) {
      await _mountPaylCardElement();
    }

    // Call backend to create Stripe setup_intent
    var { data, error } = await sb.functions.invoke('api-gateway', {
      body: {
        route: 'payl-referral-webhook',
        action: 'setup_intent',
        pdf_path: window._paylPdfPath
      }
    });

    if (error) throw error;

    var result = typeof data === 'string' ? JSON.parse(data) : data;

    if (result.error) {
      if (errorEl) errorEl.textContent = result.error;
      if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
      return;
    }

    // Confirm setup intent with card element
    if (_stripeInstance && _cardElement && result.client_secret) {
      var { error: stripeError } = await _stripeInstance.confirmCardSetup(result.client_secret, {
        payment_method: { card: _cardElement }
      });
      if (stripeError) {
        if (errorEl) errorEl.textContent = stripeError.message;
        if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
        return;
      }
    }

    // Success — move to step 3
    _paylStep = 3;
    _renderEnrollmentStep();
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_card_auth', e);
    if (errorEl) errorEl.textContent = 'Authorization failed. Please try again.';
    if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
  }

  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

// ─── Step 3: Confirmation ───
function _renderConfirmationStep() {
  _paylEvent('activated');

  return `
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:32px;margin-bottom:8px;"><i data-lucide="circle-check" class="icon-xl icon-stroke" style="stroke:hsl(142,60%,40%);width:48px;height:48px;"></i></div>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;">You're In!</div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px;">Pro features are now unlocked. Welcome to Pay After You Land.</div>
    </div>
    <div style="background:var(--bg-input);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">What happens next:</div>
      <div style="font-size:12px;line-height:1.6;">
        <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px;">
          <span style="color:var(--accent);font-weight:700;">1.</span>
          <span>Share your referral link with 3 friends. When they subscribe and stay for 30 days, your access is secured.</span>
        </div>
        <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px;">
          <span style="color:var(--accent);font-weight:700;">2.</span>
          <span>Use all Pro features — filters, AI scoring, resume rewrites, auto-apply — starting now.</span>
        </div>
        <div style="display:flex;align-items:start;gap:8px;">
          <span style="color:var(--accent);font-weight:700;">3.</span>
          <span>When you land a job, let us know. Your card will be charged at the Pro rate.</span>
        </div>
      </div>
    </div>
    <div id="payl-referral-link-box" style="padding:12px;background:var(--bg-card);border:1px solid var(--accent);border-radius:8px;display:flex;align-items:center;gap:8px;">
      <input type="text" id="payl-referral-link" value="${_paylEnrollment?.referral_code ? 'brilliantjobs.app/r/' + _paylEnrollment.referral_code : 'Loading...'}" readonly style="flex:1;background:transparent;border:none;font-size:12px;color:var(--text);outline:none;">
      <button class="btn-primary btn-sm" onclick="copyPaylReferralLink()" style="white-space:nowrap;">Copy Link</button>
    </div>
    <div style="margin-top:16px;text-align:center;">
      <button class="btn-primary" onclick="closePaylEnrollment();location.reload();" style="min-width:200px;">Start Exploring Jobs</button>
    </div>`;
}

// ═══════════════════════════════════════════════
// REFERRAL PROGRESS WIDGET (dashboard)
// ═══════════════════════════════════════════════

function _renderReferralWidget() {
  var container = document.getElementById('payl-referral-widget');
  if (!container || !_paylEnrollment) return;

  var qualified = _paylEnrollment.referrals_qualified || 0;
  var total = 3;
  var pct = Math.min(100, Math.round((qualified / total) * 100));
  var daysRemaining = 0;
  if (_paylEnrollment.expires_at) {
    daysRemaining = Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000));
  }

  var statusText = qualified >= total
    ? 'All set — you\'re covered!'
    : qualified === (total - 1)
      ? '1 more to go!'
      : 'Share your link to qualify';

  var ctaText = qualified >= total
    ? ''
    : '<button class="btn-primary btn-sm" onclick="copyPaylReferralLink()" style="white-space:nowrap;">Share Link</button>';

  container.classList.remove('u-hidden');
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;">Pay After You Land</span>
          <span style="font-size:11px;color:var(--text-dim);">${daysRemaining}d remaining</span>
        </div>
        <div style="background:var(--bg-input);border-radius:4px;height:8px;overflow:hidden;margin-bottom:4px;">
          <div style="background:var(--accent);height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);">
          <span>${qualified}/${total} referrals qualified</span>
          <span>${statusText}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${_renderReferralDots()}
        ${ctaText}
      </div>
    </div>`;
}

function _renderReferralDots() {
  var qualified = _paylEnrollment?.referrals_qualified || 0;
  var html = '';
  for (var i = 0; i < 3; i++) {
    var status = i < qualified ? 'qualified' : 'pending';
    var color = status === 'qualified' ? 'hsl(142,60%,40%)' : 'var(--border)';
    var icon = status === 'qualified' ? 'check' : 'user-plus';
    html += '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;">' +
      '<i data-lucide="' + icon + '" style="width:14px;height:14px;stroke:#fff;stroke-width:2;"></i></div>';
  }
  return html;
}

// ─── Copy referral link ───
function copyPaylReferralLink() {
  var code = _paylEnrollment?.referral_code;
  if (!code) return;

  var url = 'https://brilliantjobs.app/r/' + code;
  navigator.clipboard.writeText(url).then(function() {
    _paylEvent('referral_link_copied');
    if (typeof showToast === 'function') showToast('Referral link copied!');
  }).catch(function() {
    // Fallback: select input
    var input = document.getElementById('payl-referral-link');
    if (input) { input.select(); document.execCommand('copy'); }
  });
}

// ─── Share referral link (native share API) ───
function sharePaylReferralLink() {
  var code = _paylEnrollment?.referral_code;
  if (!code) return;

  var url = 'https://brilliantjobs.app/r/' + code;

  if (navigator.share) {
    navigator.share({
      title: 'Brilliant Jobs — Find your next role',
      text: 'I use Brilliant Jobs to find jobs. Try it out!',
      url: url
    }).then(function() {
      _paylEvent('referral_link_shared', { channel: 'native_share' });
    }).catch(function() { /* User cancelled */ });
  } else {
    copyPaylReferralLink();
  }
}

// ═══════════════════════════════════════════════
// EMPLOYMENT SELF-REPORT FLOW
// ═══════════════════════════════════════════════

function _checkEmploymentNudge() {
  if (!_paylEnrollment || _paylEnrollment.status !== 'active') return;
  if (!_paylEnrollment.activated_at) return;

  var daysSince = Math.floor((new Date() - new Date(_paylEnrollment.activated_at)) / 86400000);
  var nudgeDays = [90, 120, 150, 175];

  // Check if we should show nudge (within 3 days of a nudge point)
  var shouldNudge = nudgeDays.some(function(d) { return daysSince >= d && daysSince <= d + 3; });
  if (!shouldNudge) return;

  // Check if user dismissed recently
  try {
    var lastDismiss = localStorage.getItem('bj_payl_nudge_dismiss');
    if (lastDismiss && (Date.now() - parseInt(lastDismiss)) < 7 * 86400000) return;
  } catch (e) { /* localStorage unavailable */ }

  _showEmploymentNudge(daysSince);
}

function _showEmploymentNudge(daysSince) {
  var nudge = document.getElementById('payl-employment-nudge');
  if (!nudge) return;

  var isFinal = daysSince >= 175;
  var daysRemaining = _paylEnrollment.expires_at
    ? Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000))
    : 0;

  nudge.classList.remove('u-hidden');
  nudge.innerHTML = `
    <div style="display:flex;align-items:start;gap:12px;padding:16px;background:var(--bg-input);border-radius:10px;border:1px solid ${isFinal ? 'var(--warm)' : 'var(--border)'};">
      <div style="flex-shrink:0;"><i data-lucide="${isFinal ? 'alert-circle' : 'briefcase'}" class="icon-lg icon-stroke" style="stroke:${isFinal ? 'var(--warm)' : 'var(--accent)'};"></i></div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${isFinal ? 'Final Check-In — PAYL expires soon' : 'Have you landed a new role?'}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">
          ${isFinal
            ? 'Your PAYL window expires in ' + daysRemaining + ' days. After that, your account will revert to Free unless you convert to Pro.'
            : 'It\'s been ' + daysSince + ' days since you activated Pay After You Land. Let us know if you\'ve secured a position.'}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary btn-sm" onclick="reportPaylEmployment()">I Got the Job!</button>
          <button class="btn-secondary btn-sm" onclick="dismissPaylNudge()">Still Looking</button>
        </div>
      </div>
    </div>`;

  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

function reportPaylEmployment() {
  _paylEvent('employment_reported');

  // Show confirmation modal
  var daysRemaining = _paylEnrollment?.expires_at
    ? Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000))
    : 0;

  var nudge = document.getElementById('payl-employment-nudge');
  if (!nudge) return;

  nudge.innerHTML = `
    <div style="padding:16px;background:hsl(142,50%,96%);border:1px solid hsl(142,40%,85%);border-radius:10px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:hsl(142,60%,30%);">Congratulations!</div>
      <div style="font-size:12px;margin-bottom:12px;">Your Pro subscription will begin at the standard rate. Your saved card will be charged on your next billing date.</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">All your filters, resumes, and pipeline data will remain exactly as they are.</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary btn-sm" onclick="confirmPaylConversion()">Confirm — Start Pro</button>
        <button class="btn-secondary btn-sm" onclick="dismissPaylNudge()">Not Yet</button>
      </div>
    </div>`;
}

async function confirmPaylConversion() {
  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) return;

    var { data, error } = await sb.functions.invoke('api-gateway', {
      body: { route: 'payl-expiry-check', action: 'convert', user_id: _paylEnrollment.user_id }
    });

    if (error) throw error;

    _paylEvent('converted');

    if (typeof showToast === 'function') showToast('Welcome to Pro! Your subscription is now active.');
    setTimeout(function() { location.reload(); }, 1500);
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_convert', e);
    if (typeof showToast === 'function') showToast('Conversion failed. Please try again.', 'error');
  }
}

function dismissPaylNudge() {
  var nudge = document.getElementById('payl-employment-nudge');
  if (nudge) nudge.classList.add('u-hidden');
  try { localStorage.setItem('bj_payl_nudge_dismiss', Date.now().toString()); } catch (e) { /* ok */ }
}

// ═══════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════

window.initPayl = initPayl;
window.openPaylEnrollment = openPaylEnrollment;
window.closePaylEnrollment = closePaylEnrollment;
window.handlePaylPdfDrop = handlePaylPdfDrop;
window.handlePaylPdfSelect = handlePaylPdfSelect;
window.confirmPaylPdf = confirmPaylPdf;
window.authorizePaylCard = authorizePaylCard;
window.copyPaylReferralLink = copyPaylReferralLink;
window.sharePaylReferralLink = sharePaylReferralLink;
window.reportPaylEmployment = reportPaylEmployment;
window.confirmPaylConversion = confirmPaylConversion;
window.dismissPaylNudge = dismissPaylNudge;
window.renderPaylTierCard = renderPaylTierCard;
window.getPaylTierCard = getPaylTierCard;

// Auto-initialize when deferred chunk loads (payl.js is in the deferred chunk)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initPayl();
} else {
  document.addEventListener('DOMContentLoaded', initPayl);
}


// === js/trial-gate.js ===
// js/trial-gate.js — FB-TRIAL-001-S3/S7: Trial Gate Client + Free Samples + Inline Nudges
// Renders trial countdown banner, pre-sample prompts, post-sample conversion modals,
// and contextual inline nudges for fully-expired users.
// S7: adds all 22 PostHog events per spec §11, 7 inline nudges per spec §6.4.
// Exports: initTrialGate, showPreSamplePrompt, showSampleConversionModal,
//          hideTrialBanner, renderExpiredNudges

/* ─── Feature label map (human-readable names for modals) ─── */
var _FEATURE_LABELS = {
  chat:    'AI Chat',
  score:   'Resume Scoring',
  sms:     'SMS Alert',
  email:   'Email Notification',
  apply:   'Auto-Apply',
  stats:   'Stats Page',
  filter:  'Saved Filter',
  boolean: 'Boolean Search',
};

/* ─── State ─── */
var _trialBannerInterval = null;
var _sampleAvailability = null; // { chat: true, score: false, ... }
var _allSamplesConsumed = false; // true when expired_free + no samples left → show inline nudges
var _trialDaysRemaining = null;  // cached for event properties

/* ────────────────────────────────────────────────────────────
 *  initTrialGate()
 *  Called once from app.js init(). Fetches user_state and renders
 *  the trial countdown banner for trialing users. Caches sample
 *  availability for expired_free users.
 * ──────────────────────────────────────────────────────────── */
async function initTrialGate() {
  if (!window.currentUser) return;
  try {
    var result = await safeQuery(function() {
      return sb.from('profiles')
        .select('user_state, trial_expires_at, feature_samples_used, trial_started_at')
        .eq('id', currentUser.id)
        .single();
    }, { label: 'trial-gate:init', fallback: null });

    if (!result) return;

    var state = result.user_state;

    // Cache trial_expires_at for _daysSinceExpiry() calls
    if (result.trial_expires_at) {
      try { sessionStorage.setItem('bj_trial_expires_at', result.trial_expires_at); } catch (_e) {}
    }

    // ── TRIALING: render countdown banner + fire trial_started if fresh ──
    if (state === 'trialing' && result.trial_expires_at) {
      var now = new Date();
      var exp = new Date(result.trial_expires_at);
      var msLeft = exp.getTime() - now.getTime();
      _trialDaysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      // trial_started: fire once per user (only on first dashboard load, within 10 min of signup)
      if (result.trial_started_at) {
        var startedMsAgo = now.getTime() - new Date(result.trial_started_at).getTime();
        if (startedMsAgo < 10 * 60 * 1000 && !sessionStorage.getItem('bj_trial_started_fired')) {
          sessionStorage.setItem('bj_trial_started_fired', '1');
          if (window.posthog) posthog.capture('trial_started', {
            user_id: currentUser.id,
            signup_source: 'dashboard',
            referred_by: (window._bjReferredBy || null),
          });
        }
      }
      // trial_upgrade_prompted: fires each time the banner is rendered
      if (window.posthog) posthog.capture('trial_upgrade_prompted', {
        user_id: currentUser.id,
        trigger: 'trial_banner',
        day_of_trial: 7 - _trialDaysRemaining,
      });

      _renderTrialBanner(result.trial_expires_at);
    }

    // ── EXPIRED_FREE: cache sample availability ──
    if (state === 'expired_free') {
      var used = result.feature_samples_used || {};
      _sampleAvailability = {};
      var allFeatures = ['chat', 'score', 'sms', 'email', 'apply', 'stats', 'filter', 'boolean'];
      var anyAvailable = false;
      for (var i = 0; i < allFeatures.length; i++) {
        _sampleAvailability[allFeatures[i]] = !used[allFeatures[i]];
        if (!used[allFeatures[i]]) anyAvailable = true;
      }
      _allSamplesConsumed = !anyAvailable;

      if (_allSamplesConsumed) {
        // §6.4: render inline nudges — replaces feature UI for fully-expired users
        renderExpiredNudges();
      } else {
        // Update any gated feature buttons with sample badges
        _updateSampleBadges();
      }
    }

    // ── ACTIVE_PRO: hide banner if it exists (e.g. mid-trial upgrade) ──
    if (state === 'active_pro') {
      hideTrialBanner();
      // FB-TRIAL-001-S4 Part 5: Post-upgrade referral intro on ?upgraded=true
      _maybeShowUpgradeIntro();
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('trial-gate:init', e);
  }
}

/* ────────────────────────────────────────────────────────────
 *  _renderTrialBanner(expiresAt)
 *  Shows persistent banner below nav with countdown.
 *  Color: blue (5–7 days), amber (2–4 days), red (0–1 day).
 * ──────────────────────────────────────────────────────────── */
function _renderTrialBanner(expiresAt) {
  var banner = document.getElementById('trial-banner');
  if (!banner) return;

  function _update() {
    var now = new Date();
    var exp = new Date(expiresAt);
    var msLeft = exp.getTime() - now.getTime();
    var daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    // Determine color tier
    var bgColor, textColor;
    if (daysLeft <= 1) {
      bgColor = '#E24B4A'; textColor = '#fff';
    } else if (daysLeft <= 4) {
      bgColor = '#F59E0B'; textColor = '#1a1a2e';
    } else {
      bgColor = '#3B82F6'; textColor = '#fff';
    }

    // Determine message text
    var msg;
    if (daysLeft === 0) {
      msg = 'Trial ending today';
    } else if (daysLeft === 1) {
      msg = 'Your trial ends tomorrow';
    } else {
      msg = daysLeft + ' days left in your free trial';
    }

    banner.style.display = 'flex';
    banner.style.background = bgColor;
    banner.style.color = textColor;
    banner.innerHTML =
      '<span style="flex:1;font-size:13px;font-weight:600;">' +
        (typeof escHtml === 'function' ? escHtml(msg) : msg) +
      '</span>' +
      '<a href="/upgrade" style="background:rgba(255,255,255,0.2);color:' + textColor +
        ';padding:4px 14px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;"' +
        ' onclick="if(window.posthog)posthog.capture(\'trial_upgrade_clicked\',{source:\'trial_banner\',day_of_trial:' + (7 - daysLeft) + '})">' +
        'Upgrade now</a>';

    // If expired already, switch to hidden
    if (msLeft <= 0) {
      hideTrialBanner();
      if (_trialBannerInterval) { clearInterval(_trialBannerInterval); _trialBannerInterval = null; }
    }
  }

  _update();
  // Update every 60 seconds for live countdown
  _trialBannerInterval = setInterval(_update, 60000);
}

/* ────────────────────────────────────────────────────────────
 *  hideTrialBanner()
 * ──────────────────────────────────────────────────────────── */
function hideTrialBanner() {
  var banner = document.getElementById('trial-banner');
  if (banner) banner.style.display = 'none';
  if (_trialBannerInterval) { clearInterval(_trialBannerInterval); _trialBannerInterval = null; }
}

/* ────────────────────────────────────────────────────────────
 *  showPreSamplePrompt(featureKey, onConfirm, onCancel)
 *  Pre-sample confirmation for expired_free users.
 *  "This will use your one free [feature] sample. Continue?"
 *  Skipped for trialing/active_pro users.
 * ──────────────────────────────────────────────────────────── */
function showPreSamplePrompt(featureKey, onConfirm, onCancel) {
  var overlay = document.getElementById('pre-sample-prompt');
  if (!overlay) { if (onConfirm) onConfirm(); return; }

  var label = _FEATURE_LABELS[featureKey] || featureKey;

  overlay.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px 28px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;">Free Sample</div>' +
      '<div style="font-size:13px;color:var(--text-dim);margin-bottom:20px;line-height:1.5;">' +
        'This will use your one free <strong>' + (typeof escHtml === 'function' ? escHtml(label) : label) + '</strong> sample. Continue?' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="pre-sample-cancel" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-dim);font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button id="pre-sample-confirm" style="padding:8px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Continue</button>' +
      '</div>' +
    '</div>';

  overlay.style.display = 'flex';

  // PostHog — spec §11: sample_offered + legacy pre_sample_prompt_shown
  if (window.posthog) {
    posthog.capture('sample_offered', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
    posthog.capture('pre_sample_prompt_shown', { feature: featureKey });
  }

  // Wire buttons
  var confirmBtn = document.getElementById('pre-sample-confirm');
  var cancelBtn = document.getElementById('pre-sample-cancel');

  if (confirmBtn) {
    confirmBtn.onclick = function() {
      overlay.style.display = 'none';
      // sample_used: spec §11 — fires when sample is consumed
      if (window.posthog) {
        posthog.capture('sample_used', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
        posthog.capture('pre_sample_confirmed', { feature: featureKey });
      }
      if (onConfirm) onConfirm();
    };
  }
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('pre_sample_cancelled', { feature: featureKey });
      if (onCancel) onCancel();
    };
  }

  // Click outside to dismiss
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      if (onCancel) onCancel();
    }
  };
}

/* ────────────────────────────────────────────────────────────
 *  showSampleConversionModal(featureKey)
 *  Post-sample conversion modal. Shown AFTER the feature result
 *  is displayed, triggered by X-Is-Sample response header.
 * ──────────────────────────────────────────────────────────── */
function showSampleConversionModal(featureKey) {
  var overlay = document.getElementById('sample-conversion-modal');
  if (!overlay) return;

  var label = _FEATURE_LABELS[featureKey] || featureKey;

  overlay.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,0.35);">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
        '<i data-lucide="sparkles" style="width:24px;height:24px;color:#fff;"></i>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">That was your free ' +
        (typeof escHtml === 'function' ? escHtml(label) : label) + ' sample</div>' +
      '<div style="font-size:13px;color:var(--text-dim);margin-bottom:22px;line-height:1.5;">' +
        'Upgrade to Pro for unlimited ' + (typeof escHtml === 'function' ? escHtml(label) : label) + ' and all other Pro features.' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;">' +
        '<a href="/upgrade" id="sample-modal-upgrade" style="display:inline-block;padding:10px 28px;border-radius:8px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;text-decoration:none;width:100%;max-width:280px;">Upgrade to Pro</a>' +
        '<button id="sample-modal-dismiss" style="padding:8px 18px;border:none;background:none;color:var(--text-faint);font-size:12px;cursor:pointer;">Maybe later</button>' +
      '</div>' +
    '</div>';

  overlay.style.display = 'flex';

  // PostHog
  if (window.posthog) posthog.capture('sample_conversion_prompted', { feature: featureKey });

  // Refresh Lucide icons for the sparkles icon
  if (typeof refreshIcons === 'function') refreshIcons();

  // Wire dismiss
  var dismissBtn = document.getElementById('sample-modal-dismiss');
  if (dismissBtn) {
    dismissBtn.onclick = function() {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('sample_conversion_dismissed', { feature: featureKey });
    };
  }

  // Wire upgrade click tracking
  var upgradeBtn = document.getElementById('sample-modal-upgrade');
  if (upgradeBtn) {
    upgradeBtn.onclick = function() {
      // sample_converted: user upgrades immediately after sample — spec §11
      if (window.posthog) {
        posthog.capture('sample_converted', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
        posthog.capture('sample_conversion_upgrade_click', { feature: featureKey });
      }
    };
  }

  // Click outside to dismiss
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('sample_conversion_dismissed', { feature: featureKey });
    }
  };

  // Mark sample as consumed in local cache
  if (_sampleAvailability) {
    _sampleAvailability[featureKey] = false;
    _updateSampleBadges();
  }
}

/* ────────────────────────────────────────────────────────────
 *  handleSampleHeader(response, featureKey)
 *  Utility: after a gated API call, check for X-Is-Sample header
 *  and trigger the post-sample conversion modal.
 *  Call AFTER displaying the feature result to the user.
 * ──────────────────────────────────────────────────────────── */
function handleSampleHeader(response, featureKey) {
  if (!response || !response.headers) return;
  var isSample = response.headers.get('X-Is-Sample');
  if (isSample === 'true') {
    // Delay slightly to ensure the feature result is visible first
    setTimeout(function() {
      showSampleConversionModal(featureKey);
    }, 800);
  }
}

/* ────────────────────────────────────────────────────────────
 *  getSampleAvailability()
 *  Returns cached sample availability map, or null if not loaded.
 *  { chat: true, score: false, ... }
 * ──────────────────────────────────────────────────────────── */
function getClientSampleAvailability() {
  return _sampleAvailability;
}

/* ────────────────────────────────────────────────────────────
 *  _updateSampleBadges()
 *  Updates gated feature buttons with "1 free try" badges
 *  when samples are available.
 * ──────────────────────────────────────────────────────────── */
function _updateSampleBadges() {
  if (!_sampleAvailability) return;

  // Remove any existing sample badges
  var existing = document.querySelectorAll('.trial-sample-badge');
  for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
  }

  // Map feature keys to button selectors
  var _FEATURE_BUTTON_MAP = {
    chat:    '#search-mode-toggle-chat, [data-feature-gate="chat"]',
    score:   '[data-feature-gate="score"]',
    apply:   '[data-feature-gate="apply"]',
    stats:   '[data-page="stats"]',
    filter:  '[data-feature-gate="filter"]',
    boolean: '[data-feature-gate="boolean"]',
    sms:     '[data-feature-gate="sms"]',
    email:   '[data-feature-gate="email"]',
  };

  var keys = Object.keys(_FEATURE_BUTTON_MAP);
  for (var k = 0; k < keys.length; k++) {
    var feature = keys[k];
    if (!_sampleAvailability[feature]) continue; // already consumed or not available

    var btns = document.querySelectorAll(_FEATURE_BUTTON_MAP[feature]);
    for (var b = 0; b < btns.length; b++) {
      var btn = btns[b];
      // Only add badge if button is positioned relatively or we can attach
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      var badge = document.createElement('span');
      badge.className = 'trial-sample-badge';
      badge.textContent = '1 free try';
      badge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:var(--accent);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;white-space:nowrap;pointer-events:none;z-index:2;';
      btn.appendChild(badge);
    }
  }
}

/* ────────────────────────────────────────────────────────────
 *  _maybeShowUpgradeIntro()
 *  FB-TRIAL-001-S4 Part 5: Shows post-upgrade toast + referral card
 *  if ?upgraded=true is in the URL (once per page load, then param cleared).
 * ─────────────────────────────────────────────────────────── */
function _maybeShowUpgradeIntro() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') !== 'true') return;

    // Clear param from URL without reload
    params.delete('upgraded');
    var newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);

    // Delegate to referrals.js (deferred chunk — may not be loaded yet)
    if (typeof window.showUpgradeReferralIntro === 'function') {
      window.showUpgradeReferralIntro();
    } else {
      // Wait for deferred chunk
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        if (typeof window.showUpgradeReferralIntro === 'function') {
          clearInterval(poll);
          window.showUpgradeReferralIntro();
        } else if (attempts > 20) {
          clearInterval(poll);
        }
      }, 200);
    }

    // Part 6: ensure sidebar link visible
    if (typeof window.initSidebarReferralLink === 'function') {
      window.initSidebarReferralLink('active_pro');
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('trial-gate:upgrade-intro', e);
  }
}

/* ────────────────────────────────────────────────────────────
 *  _daysSinceExpiry()
 *  Returns days since trial expired (for PostHog event properties).
 *  Uses trial_expires_at from the banner interval if available,
 *  otherwise returns 0 as a safe default.
 * ──────────────────────────────────────────────────────────── */
function _daysSinceExpiry() {
  try {
    // Try to read from cached profile if available
    var cached = sessionStorage.getItem('bj_trial_expires_at');
    if (cached) {
      var diff = Date.now() - new Date(cached).getTime();
      return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }
  } catch (_e) { /* ignore */ }
  return 0;
}

/* ────────────────────────────────────────────────────────────
 *  renderExpiredNudges()
 *  §6.4: Contextual inline nudges for expired_free users with
 *  all samples consumed. Injects small upgrade prompts into 7
 *  feature locations. Fires expired_gate_hit for each location.
 * ──────────────────────────────────────────────────────────── */
function renderExpiredNudges() {
  var upgradeUrl = '/upgrade';
  var nudgeStyle = 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;' +
    'border-radius:8px;background:var(--bg-card);border:1px solid var(--border);' +
    'font-size:12px;color:var(--text-dim);margin-top:6px;';
  var ctaStyle = 'color:var(--accent);font-weight:700;text-decoration:none;';

  function _makeNudge(msgHtml, feature) {
    var el = document.createElement('div');
    el.className = 'trial-expired-nudge';
    el.setAttribute('data-feature', feature);
    el.style.cssText = nudgeStyle;
    el.innerHTML = msgHtml + ' <a href="' + upgradeUrl + '" style="' + ctaStyle + '">Upgrade</a>';
    el.querySelector('a').addEventListener('click', function() {
      if (window.posthog) posthog.capture('trial_upgrade_clicked', {
        source: 'inline_nudge',
        feature: feature,
        days_since_expiry: _daysSinceExpiry(),
      });
    });
    return el;
  }

  function _fireGateHit(feature) {
    if (window.posthog) posthog.capture('expired_gate_hit', {
      feature: feature,
      days_since_expiry: _daysSinceExpiry(),
    });
  }

  // 1. Chat tab — disable input, show static card above it
  var chatInput = document.getElementById('chat-input');
  if (chatInput && !document.querySelector('.trial-expired-nudge[data-feature="chat"]')) {
    _fireGateHit('chat');
    var chatNudge = _makeNudge('You used your free AI Chat sample.', 'chat');
    chatNudge.style.cssText += 'width:100%;box-sizing:border-box;justify-content:center;';
    chatInput.parentNode.insertBefore(chatNudge, chatInput);
    chatInput.disabled = true;
    chatInput.placeholder = 'Upgrade to continue using AI Chat';
    chatInput.style.opacity = '0.4';
  }

  // 2. Boolean search toggle — disable + add Pro badge
  var booleanToggle = document.getElementById('boolean-toggle') ||
    document.querySelector('[data-feature-gate="boolean"]');
  if (booleanToggle && !document.querySelector('.trial-expired-nudge[data-feature="boolean"]')) {
    _fireGateHit('boolean');
    booleanToggle.disabled = true;
    booleanToggle.style.opacity = '0.4';
    var boolNudge = document.createElement('span');
    boolNudge.className = 'trial-expired-nudge';
    boolNudge.setAttribute('data-feature', 'boolean');
    boolNudge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
      'background:var(--accent);color:#fff;font-size:9px;font-weight:700;';
    boolNudge.textContent = 'Pro';
    booleanToggle.parentNode && booleanToggle.parentNode.insertBefore(boolNudge, booleanToggle.nextSibling);
  }

  // 3. Stats page — blur charts with upgrade overlay
  var statsPage = document.getElementById('page-stats');
  if (statsPage && !document.querySelector('.trial-expired-nudge[data-feature="stats"]')) {
    _fireGateHit('stats');
    var statsOverlay = document.createElement('div');
    statsOverlay.className = 'trial-expired-nudge';
    statsOverlay.setAttribute('data-feature', 'stats');
    statsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(var(--bg-rgb,255,255,255),0.85);backdrop-filter:blur(4px);' +
      'z-index:10;border-radius:8px;gap:10px;';
    statsOverlay.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--text);">' +
      'Upgrade to see your analytics</div>' +
      '<a href="' + upgradeUrl + '" style="' + ctaStyle + 'font-size:13px;padding:8px 20px;' +
      'background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;">Upgrade to Pro</a>';
    statsOverlay.querySelector('a').addEventListener('click', function() {
      if (window.posthog) posthog.capture('trial_upgrade_clicked', { source: 'inline_nudge', feature: 'stats' });
    });
    var statsInner = statsPage.querySelector('.page-content, .stats-content, section') || statsPage;
    statsInner.style.position = 'relative';
    statsInner.appendChild(statsOverlay);
  }

  // 4. Saved filter counter nudge — append after filter list header
  var filterListHeader = document.getElementById('saved-filters-header') ||
    document.querySelector('.sf-header, #saved-searches-header');
  if (filterListHeader && !document.querySelector('.trial-expired-nudge[data-feature="filter"]')) {
    _fireGateHit('filter');
    var filterNudge = _makeNudge('You\'ve used your free filter sample.', 'filter');
    filterListHeader.parentNode && filterListHeader.parentNode.insertBefore(filterNudge, filterListHeader.nextSibling);
  }

  // 5. SMS notification toggles — disable + badge
  var smsToggles = document.querySelectorAll('[data-feature-gate="sms"], .sms-toggle, #sms-enabled-toggle');
  if (smsToggles.length > 0 && !document.querySelector('.trial-expired-nudge[data-feature="sms"]')) {
    _fireGateHit('sms');
    smsToggles.forEach(function(toggle) {
      toggle.disabled = true;
      toggle.style.opacity = '0.4';
      var badge = document.createElement('span');
      badge.className = 'trial-expired-nudge';
      badge.setAttribute('data-feature', 'sms');
      badge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
        'background:var(--bg-card);border:1px solid var(--border);color:var(--text-dim);font-size:9px;font-weight:700;';
      badge.textContent = 'Pro feature';
      toggle.parentNode && toggle.parentNode.insertBefore(badge, toggle.nextSibling);
    });
  }

  // 6. Resume score column — "Upgrade to score more" note below score cards
  var scoreArea = document.querySelector('.readiness-area, #readiness-section, [data-feature-gate="score"]');
  if (scoreArea && !document.querySelector('.trial-expired-nudge[data-feature="score"]')) {
    _fireGateHit('score');
    var scoreNudge = _makeNudge('Upgrade to score more resumes.', 'score');
    scoreArea.appendChild(scoreNudge);
  }

  // 7. Extension auto-apply button placeholder — injected via data attribute
  // Extension handles its own gating; we ensure the page-level settings button is flagged
  var autoApplyBtn = document.querySelector('[data-feature-gate="apply"], #auto-apply-btn, .auto-apply-toggle');
  if (autoApplyBtn && !document.querySelector('.trial-expired-nudge[data-feature="apply"]')) {
    _fireGateHit('apply');
    autoApplyBtn.disabled = true;
    autoApplyBtn.style.opacity = '0.4';
    var applyBadge = document.createElement('span');
    applyBadge.className = 'trial-expired-nudge';
    applyBadge.setAttribute('data-feature', 'apply');
    applyBadge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
      'background:var(--accent);color:#fff;font-size:9px;font-weight:700;';
    applyBadge.textContent = 'Pro';
    autoApplyBtn.parentNode && autoApplyBtn.parentNode.insertBefore(applyBadge, autoApplyBtn.nextSibling);
  }
}

/* ─── Exports to window + BJ namespace ─── */
window.initTrialGate = initTrialGate;
window.showPreSamplePrompt = showPreSamplePrompt;
window.showSampleConversionModal = showSampleConversionModal;
window.hideTrialBanner = hideTrialBanner;
window.handleSampleHeader = handleSampleHeader;
window.getClientSampleAvailability = getClientSampleAvailability;
window.renderExpiredNudges = renderExpiredNudges;

if (typeof window.BJ !== 'undefined') {
  BJ.initTrialGate = initTrialGate;
  BJ.showPreSamplePrompt = showPreSamplePrompt;
  BJ.showSampleConversionModal = showSampleConversionModal;
  BJ.hideTrialBanner = hideTrialBanner;
  BJ.handleSampleHeader = handleSampleHeader;
  BJ.getClientSampleAvailability = getClientSampleAvailability;
  BJ.renderExpiredNudges = renderExpiredNudges;
}


// === js/upgrade.js ===
// js/upgrade.js
// FB-TRIAL-001-S6 — 5.3: Monthly/Annual billing toggle on upgrade page
// Renders toggle UI, updates CTA price display, passes billing_period to create-checkout EF
// Exports: initBillingToggle (window + BJ namespace)

/* global sb, SUPABASE_URL, showToast, posthog */

var _billingPeriod = 'monthly'; // 'monthly' | 'annual'

var MONTHLY_PRICE_DISPLAY = '$19.99/mo';
var ANNUAL_PRICE_DISPLAY = '$199.90/yr';
var ANNUAL_SAVINGS_DISPLAY = 'save 17%';

// ─── Render toggle pills ───
function _renderBillingToggle(container) {
  container.innerHTML = [
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
    '<button id="billing-toggle-monthly" onclick="setBillingPeriod(\'monthly\')" ',
    'style="',
    'padding:6px 16px;border-radius:999px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid;transition:all 0.15s;',
    (_billingPeriod === 'monthly' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : 'background:transparent;color:var(--text-muted);border-color:var(--border);'),
    '">Monthly &mdash; ' + MONTHLY_PRICE_DISPLAY + '</button>',
    '<button id="billing-toggle-annual" onclick="setBillingPeriod(\'annual\')" ',
    'style="',
    'padding:6px 16px;border-radius:999px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid;transition:all 0.15s;',
    (_billingPeriod === 'annual' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : 'background:transparent;color:var(--text-muted);border-color:var(--border);'),
    '">Annual &mdash; ' + ANNUAL_PRICE_DISPLAY + ' <span style="font-size:11px;opacity:0.85;">(' + ANNUAL_SAVINGS_DISPLAY + ')</span></button>',
    '</div>',
  ].join('');
}

// ─── Update CTA button text based on period ───
function _updateCtaButton() {
  var btn = document.getElementById('sub-upgrade-cta-btn');
  if (!btn) return;
  if (_billingPeriod === 'annual') {
    btn.textContent = 'Upgrade to Pro — ' + ANNUAL_PRICE_DISPLAY;
  } else {
    btn.textContent = 'Upgrade to Pro — ' + MONTHLY_PRICE_DISPLAY;
  }
}

// ─── Public: set billing period ───
window.setBillingPeriod = function(period) {
  if (period !== 'monthly' && period !== 'annual') return;
  _billingPeriod = period;
  var container = document.getElementById('billing-toggle');
  if (container) _renderBillingToggle(container);
  _updateCtaButton();
  if (typeof posthog !== 'undefined') {
    posthog.capture('billing_period_toggled', { period: period });
  }
};

// ─── Public: get current period for checkout ───
window.getBillingPeriod = function() { return _billingPeriod; };

// ─── Init: show toggle container, render pills ───
function initBillingToggle() {
  var container = document.getElementById('billing-toggle');
  if (!container) return;
  container.style.display = 'block';
  _billingPeriod = 'monthly';
  _renderBillingToggle(container);
  _updateCtaButton();
}

window.initBillingToggle = initBillingToggle;

// ─── Hook into startCheckout to pass billing_period ───
// Monkey-patch billing.js startCheckout to include billing_period
(function() {
  var _originalStartCheckout = window.startCheckout;
  window.startCheckout = async function(mode, tier, packQty) {
    if (mode === 'subscription' && tier === 'pro') {
      // Inject billing_period into the checkout
      var session = await sb.auth.getSession();
      var token = session?.data?.session?.access_token;
      if (!token) { window.location.href = '/'; return; }
      if (typeof posthog !== 'undefined') posthog.capture('billing_checkout_started', { mode, tier, billing_period: _billingPeriod });
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'subscription', tier: 'pro', billing_period: _billingPeriod }),
        });
        var data = await res.json();
        if (data.url) { window.location.href = data.url; }
        else { showToast('Failed to start checkout. Please try again.', 'error'); }
      } catch (e) { showToast('Network error. Please try again.', 'error'); }
      return;
    }
    if (typeof _originalStartCheckout === 'function') {
      return _originalStartCheckout(mode, tier, packQty);
    }
  };
})();

// ─── Auto-init when upgrade banner is visible ───
(function() {
  // Watch for the sub-upgrade-banner becoming visible
  var banner = document.getElementById('sub-upgrade-banner');
  if (!banner) return;
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        if (!banner.classList.contains('u-hidden')) {
          initBillingToggle();
        }
      }
    });
  });
  obs.observe(banner, { attributes: true });
})();

// ─── BJ namespace ───
(function() {
  if (!window.BJ) window.BJ = {};
  window.BJ.initBillingToggle = initBillingToggle;
  window.BJ.setBillingPeriod = window.setBillingPeriod;
  window.BJ.getBillingPeriod = window.getBillingPeriod;
  if (window.BJ._registry) {
    window.BJ._registry['initBillingToggle'] = { module: 'upgrade', registered: Date.now() };
  }
})();
