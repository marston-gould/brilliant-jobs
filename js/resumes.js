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
      ? '<span style="font-size:9px;font-weight:600;padding:2px 6px;border-radius:4px;background:linear-gradient(135deg,rgba(77,142,255,0.1),rgba(124,58,237,0.1));border:1px solid rgba(77,142,255,0.15);color:#4d8eff;cursor:help;" title="' + (r.tier_history || []).map(function(h) { return h.action + ' (' + h.tier + ')'; }).join(' → ') + '">✨ Premium Rewrite' + (r.rewrite_round > 1 ? ' R' + r.rewrite_round : '') + '</span>'
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
        (isCooldown ? 'disabled' : '') + '>\u{1F504} Rescore</button>';
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
        <span class="sf-del" onclick="event.stopPropagation();confirmDeleteResume(${i})" title="Delete">✕</span>
        <div class="nri-icon ${icon.cls}">${isPlaceholder ? '?' : icon.text}</div>
        <div class="nri-info">
          <div class="nri-name" title="${escapeHtml(r.name||'')}">${escapeHtml(r.name)}${gdriveIcon}${tierBadge}${aiBadge}${scoreHistory}${rescoreBtn}</div>
          <div class="nri-meta">${!isPlaceholder ? r.size + ' \u00b7 ' + r.uploadedAt : 'Placeholder'} \u00b7 ${assignedIds.length} filter${assignedIds.length !== 1 ? 's' : ''}${assignedLevels.length > 0 ? ' \u00b7 ' + assignedLevels.join(', ') : ''}${jobsApplied > 0 ? ' \u00b7 ' + jobsApplied + ' applied' : ''}</div>
        </div>
        <div class="nri-filters">${filterDots}</div>
        <div class="nri-score ${scoreClass}">${scoreDisplay}</div>
        <div class="nri-actions" onclick="event.stopPropagation()">
          <button onclick="downloadResume(${i})" title="Download">⬇</button>
          <button onclick="renameResume(${i})" title="Rename">✎</button>
          <button onclick="archiveResume(${i})" title="Archive">📦</button>
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
      <span class="sf-del" onclick="confirmDeleteResume(${i})" title="Delete" style="opacity:0.4;font-size:11px;color:var(--text-faint);cursor:pointer;width:20px;text-align:center;flex-shrink:0;border-radius:4px;">✕</span>
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
  // Re-open the panel that was active before re-render
  if (_activeResumePanel >= 0) {
    var panel = document.getElementById('ai-panel-' + _activeResumePanel);
    var row = document.getElementById('nri-' + _activeResumePanel);
    if (panel) panel.classList.add('open');
    if (row) row.classList.add('selected');
  }
};

window.toggleResumeLevel = function(idx, levelLabel) {
  const r = resumes[idx];
  // Migrate from old single levelLabel to new levelLabels array
  if (!r.levelLabels) r.levelLabels = r.levelLabel ? [r.levelLabel] : [];
  const pos = r.levelLabels.indexOf(levelLabel);
  if (pos >= 0) {
    r.levelLabels.splice(pos, 1);
  } else {
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
    btn.innerHTML = '\u{1F504} Rescoring…';
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
      btn.innerHTML = '\u{1F504} Rescore';
      clearInterval(interval);
    } else {
      const sec = Math.ceil(remaining / 1000);
      btn.title = 'Cooldown: wait ' + sec + 's';
      btn.innerHTML = '\u{1F504} ' + sec + 's';
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
    'triggerGapAnalysis', 'renderGapInsights', 'onGapTermClick'
  ];
  exports.forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'resumes', registered: Date.now() };
    }
  });
})();
