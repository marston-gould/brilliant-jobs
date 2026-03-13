// ============================================================
// RESUME PICKER ON APPLY
// ============================================================
let _rpCallback = null;
let _rpSelected = null;
let _rpJobId = null;

function showResumePicker(jobId, callback) {
  _rpJobId = jobId;
  _rpCallback = callback;
  _rpSelected = null;

  const resumes = safeReadLS('bj_resumes', []);
  const sf = safeReadLS('bj_saved_filters', []);
  const optionsEl = $('#rp-options');

  if (resumes.length === 0) {
    // No resumes uploaded — skip picker, go straight through
    callback(null);
    return;
  }

  // Try to pre-select: find resume assigned to checked filters
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  const autoMatch = resumes.find(r => !r.archived && r.filterIds?.some(f => checkedFilters.includes(f)));
  if (autoMatch) _rpSelected = autoMatch.name;

  let html = '';
  resumes.filter(r => !r.needsUpload && !r.archived).forEach(r => {
    const sel = r.name === _rpSelected ? ' selected' : '';
    const filterNames = (r.filterIds || []).join(', ');
    const levelStr = r.levelLabel ? r.levelLabel + ' · ' : '';
    const meta = [levelStr + r.fileName, r.size, filterNames ? 'Filters: ' + filterNames : ''].filter(Boolean).join(' · ');
    html += `<div class="rp-option${sel}" data-rp-name="${r.name.replace(/"/g, '&quot;')}" onclick="selectResumePick(this)">
      <div class="rp-radio"></div>
      <div>
        <div class="rp-name">${r.name}${r.levelLabel ? ' <span style="color:' + (r.levelColor || '#94a3b8') + ';font-size:10px;">' + r.levelLabel + '</span>' : ''}</div>
        <div class="rp-meta">${meta}</div>
      </div>
    </div>`;
  });

  if (html === '') {
    // All resumes are placeholders
    callback(null);
    return;
  }

  optionsEl.innerHTML = html;
  $('#resume-picker-overlay').classList.add('open');
}

function selectResumePick(el) {
  $$('#rp-options .rp-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  _rpSelected = el.dataset.rpName;
}

function confirmResumePick() {
  closeResumePicker(false);
  if (_rpCallback) _rpCallback(_rpSelected);
}

function closeResumePicker(skip) {
  $('#resume-picker-overlay').classList.remove('open');
  if (skip && _rpCallback) _rpCallback(null);
  _rpCallback = null;
}

// Init pipeline — guard calls since pipeline.js is in a separate chunk and may load later
if (typeof migratePipelineData === 'function') migratePipelineData();
if (typeof buildPipelineFilterTags === 'function') buildPipelineFilterTags();
setTimeout(() => { if (typeof renderPipeline === 'function') renderPipeline(); }, 800);


// ============================================================
// TUNING — Global search settings
// ============================================================
// ---- Tuning card collapse persistence ----
function toggleTuningCard(header) {
  const card = header.parentElement;
  card.classList.toggle('collapsed');
  saveTuningCollapseStates();
}

function saveTuningCollapseStates() {
  const states = safeReadLS('bj_collapse', {});
  states.tuning = {};
  $$('.tuning-card').forEach(card => {
    if (card.id) states.tuning[card.id] = card.classList.contains('collapsed');
  });
  localStorage.setItem('bj_collapse', JSON.stringify(states));
}

// Restore tuning card states
(function() {
  const states = safeReadLS('bj_collapse', {});
  const tuning = states.tuning || {};
  Object.entries(tuning).forEach(([id, collapsed]) => {
    const card = document.getElementById(id);
    if (card && collapsed) card.classList.add('collapsed');
  });
})();

tuningSettings = safeReadLS('bj_tuning', {});
tuningLocExclPills = tuningSettings.locationExcludes || [];
tuningTitleExclPills = tuningSettings.titleExcludes || [];
tuningCoExclPills = tuningSettings.companyExcludes || [];
tuningIndExclPills = tuningSettings.industryExcludes || [];

function saveTuning() {
  tuningSettings.usOnly = $('#tuning-us-only').checked;
  tuningSettings.excludeHourly = $('#tuning-exclude-hourly').checked;
  tuningSettings.excludeStaffing = $('#tuning-exclude-staffing')?.checked || false;
  tuningSettings.locationExcludes = tuningLocExclPills;
  tuningSettings.titleExcludes = tuningTitleExclPills;
  tuningSettings.companyExcludes = tuningCoExclPills;
  tuningSettings.industryExcludes = tuningIndExclPills;
  saveUserData('bj_tuning', JSON.stringify(tuningSettings));
  updateTuningStatusDot();
  // QA-011: Flag that tuning changed — feed will re-search on next tab switch
  window._tuningDirty = true;
}

function updateTuningStatusDot() {
  const dot = $('#tuning-status-dot');
  if (!dot) return;
  const hasCustom =
    tuningSettings.usOnly ||
    tuningSettings.excludeHourly ||
    tuningSettings.excludeStaffing ||
    (tuningLocExclPills && tuningLocExclPills.length > 0) ||
    (tuningTitleExclPills && tuningTitleExclPills.length > 0) ||
    (tuningCoExclPills && tuningCoExclPills.length > 0) ||
    (tuningIndExclPills && tuningIndExclPills.length > 0) ||
    (tuningSettings.levelHierarchy && JSON.stringify(tuningSettings.levelHierarchy) !== JSON.stringify(DEFAULT_LEVELS));
  if (hasCustom) {
    dot.className = 'ext-status-dot connected';
    dot.title = 'Custom rules active';
  } else {
    dot.className = 'ext-status-dot warning';
    dot.title = 'Default settings — no custom rules';
  }
}

// ---- Title Level Hierarchy ----
const DEFAULT_LEVELS = [
  { label: 'C-Suite', keywords: 'ceo, cto, cmo, cfo, cro, coo, chief', color: '#ef4444' },
  { label: 'VP', keywords: 'vice president, vp, svp, evp', color: '#f97316' },
  { label: 'Sr Director', keywords: 'senior director, sr director, sr. director', color: '#f59e0b' },
  { label: 'Director', keywords: 'director', color: '#eab308' },
  { label: 'Assoc Director', keywords: 'associate director, asst director, assistant director', color: '#84cc16' },
  { label: 'Sr Manager', keywords: 'senior manager, sr manager, sr. manager', color: '#22c55e' },
  { label: 'Lead', keywords: 'lead, principal, head of', color: '#06b6d4' },
  { label: 'Manager', keywords: 'manager', color: '#14b8a6' },
  { label: 'Senior', keywords: 'senior, sr, sr.', color: '#3b82f6' },
  { label: 'Mid', keywords: 'associate, coordinator', color: '#8b5cf6' },
  { label: 'Entry', keywords: 'junior, jr, intern, entry', color: '#a855f7' },
];
levelHierarchy = tuningSettings.levelHierarchy || JSON.parse(JSON.stringify(DEFAULT_LEVELS));

function saveLevels() {
  tuningSettings.levelHierarchy = levelHierarchy;
  saveUserData('bj_tuning', JSON.stringify(tuningSettings));
  updateTuningBadges();
}

function renderLevelTable() {
  const tbody = $('#level-table-body');
  tbody.innerHTML = '';
  levelHierarchy.forEach((lvl, i) => {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.idx = i;
    tr.innerHTML = `
      <td class="level-rank">${i + 1}</td>
      <td><input class="level-name" data-idx="${i}" data-field="label" value="${(lvl.label||'').replace(/"/g,'&quot;')}" placeholder="Level name"></td>
      <td><input data-idx="${i}" data-field="keywords" value="${(lvl.keywords||'').replace(/"/g,'&quot;')}" placeholder="keyword1, keyword2, …"></td>
      <td><button class="level-del" data-idx="${i}">✕</button></td>
    `;
    tbody.appendChild(tr);

    // Drag handlers
    tr.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', i);
      tr.style.opacity = '0.4';
    });
    tr.addEventListener('dragend', () => { tr.style.opacity = ''; });
    tr.addEventListener('dragover', e => { e.preventDefault(); tr.style.background = 'var(--bg-hover)'; });
    tr.addEventListener('dragleave', () => { tr.style.background = ''; });
    tr.addEventListener('drop', e => {
      e.preventDefault();
      tr.style.background = '';
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const toIdx = i;
      if (fromIdx === toIdx) return;
      const [moved] = levelHierarchy.splice(fromIdx, 1);
      levelHierarchy.splice(toIdx, 0, moved);
      saveLevels();
      renderLevelTable();
    });
  });

  // Bind input changes
  tbody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.idx);
      const field = inp.dataset.field;
      levelHierarchy[idx][field] = inp.value.trim();
      saveLevels();
    });
  });

  // Bind delete
  tbody.querySelectorAll('.level-del').forEach(btn => {
    btn.addEventListener('click', () => {
      levelHierarchy.splice(parseInt(btn.dataset.idx), 1);
      saveLevels();
      renderLevelTable();
    });
  });
}

$('#level-add-btn').addEventListener('click', () => {
  levelHierarchy.push({ label: '', keywords: '', color: '#94a3b8' });
  saveLevels();
  renderLevelTable();
  // Focus the new name input
  const lastInput = $('#level-table-body').querySelector('tr:last-child input.level-name');
  if (lastInput) lastInput.focus();
});

renderLevelTable();

// ---- Level Matching Engine ----
// Matches a job title against the hierarchy, longest keyword first to avoid partial matches
function getJobLevel(title, hierarchy) {
  const levels = hierarchy || levelHierarchy;
  if (!title || levels.length === 0) return null;
  const t = ' ' + title.toLowerCase() + ' ';
  // Build flat list of {keyword, rank, label, color} sorted by keyword length desc
  const entries = [];
  levels.forEach((lvl, rank) => {
    (lvl.keywords || '').split(',').forEach(kw => {
      const k = kw.trim().toLowerCase();
      if (k) entries.push({ keyword: k, rank, label: lvl.label, color: lvl.color || '#94a3b8' });
    });
  });
  // Sort longest first so "senior director" matches before "director"
  entries.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const e of entries) {
    // Word boundary check: keyword must be preceded/followed by space, hyphen, slash, paren, comma, or start/end
    const escaped = e.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s,\\-\\/\\(])${escaped}(?:[\\s,\\-\\/\\)]|$)`, 'i');
    if (re.test(t)) {
      return { rank: e.rank, label: e.label, color: e.color };
    }
  }
  return null;
}

// Restore state
if (tuningSettings.usOnly) $('#tuning-us-only').checked = true;
if (tuningSettings.excludeHourly) $('#tuning-exclude-hourly').checked = true;
if (tuningSettings.excludeStaffing && $('#tuning-exclude-staffing')) $('#tuning-exclude-staffing').checked = true;

// Per-filter level hierarchy editor — uses a modal-style overlay
window.editFilterLevelHierarchy = function(filterIdx) {
  const sf = savedFilters[filterIdx];
  if (!sf) return;

  // If filter has no custom hierarchy, start from default
  let filterLevels = sf.levelHierarchy
    ? JSON.parse(JSON.stringify(sf.levelHierarchy))
    : JSON.parse(JSON.stringify(levelHierarchy));

  // Level assignments: which levels this filter targets
  let assignedLevels = sf.assignedLevels ? [...sf.assignedLevels] : [];
  let includeOther = sf.includeOtherLevels || false;

  // Build overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';

  function getOtherFilterAssignments() {
    const map = {};
    savedFilters.forEach((f, i) => {
      if (i === filterIdx || !f.assignedLevels) return;
      f.assignedLevels.forEach(lbl => {
        if (!map[lbl]) map[lbl] = [];
        map[lbl].push({ name: f.name, idx: i });
      });
    });
    return map;
  }

  function renderModal() {
    const isCustom = !!sf.levelHierarchy;
    const otherAssignments = getOtherFilterAssignments();
    const hasAnyAssigned = assignedLevels.length > 0;

    overlay.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:580px;width:90%;max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text);">Levels — ${sf.name}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px;">
            Select which seniority levels this filter targets
          </div>
        </div>
        <button id="fl-close" style="background:none;border:none;font-size:20px;color:var(--text-faint);cursor:pointer;padding:4px 8px;">✕</button>
      </div>

      <!-- Level assignment section -->
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-faint);margin-bottom:8px;">Assigned Levels</div>
        <div id="fl-level-checks" style="display:flex;flex-direction:column;gap:4px;"></div>
        ${hasAnyAssigned ? `
        <label style="display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 12px;background:var(--bg-input);border-radius:8px;cursor:pointer;">
          <input type="checkbox" id="fl-include-other" ${includeOther ? 'checked' : ''} style="accent-color:var(--accent);">
          <span style="font-size:12px;color:var(--text-dim);">Include Other Levels</span>
          <span style="font-size:10px;color:var(--text-faint);margin-left:auto;">Levels not assigned to any filter</span>
        </label>` : `
        <div style="padding:8px 12px;background:var(--bg-input);border-radius:8px;margin-top:8px;font-size:11px;color:var(--text-faint);">
          No levels selected — this filter matches <strong>all levels</strong>
        </div>`}
      </div>

      <!-- Hierarchy editor -->
      <details style="margin-bottom:16px;">
        <summary style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-faint);cursor:pointer;padding:4px 0;">
          ${isCustom ? '⚙ Custom Hierarchy (click to edit)' : '⚙ Level Hierarchy (click to customize)'}
        </summary>
        <div style="margin-top:8px;">
          <table class="level-table">
            <thead><tr>
              <th style="width:36px;">#</th>
              <th style="width:130px;">Level</th>
              <th>Match Keywords</th>
              <th style="width:40px;"></th>
            </tr></thead>
            <tbody id="fl-tbody"></tbody>
          </table>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <button id="fl-add" class="btn btn-sm" style="padding:4px 14px;font-size:11px;background:transparent;color:var(--accent);border:1px solid var(--accent);cursor:pointer;">+ Add Level</button>
            <button id="fl-reset" class="btn btn-sm" style="padding:4px 14px;font-size:11px;background:transparent;color:var(--text-faint);border:1px solid var(--border);cursor:pointer;">Reset to Default</button>
          </div>
        </div>
      </details>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="fl-cancel" class="btn btn-sm" style="padding:6px 16px;font-size:12px;background:transparent;color:var(--text-faint);border:1px solid var(--border);cursor:pointer;">Cancel</button>
        <button id="fl-save" class="btn btn-sm btn-primary" style="padding:6px 20px;font-size:12px;">Save</button>
      </div>
    </div>`;

    // Render level checkboxes
    const checksEl = overlay.querySelector('#fl-level-checks');
    filterLevels.forEach((lvl, i) => {
      const isAssigned = assignedLevels.includes(lvl.label);
      const otherFilter = otherAssignments[lvl.label];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);' + (isAssigned ? 'background:var(--accent-glow);border-color:rgba(61,126,255,0.3);' : '');
      row.innerHTML = `
        <input type="checkbox" class="fl-level-cb" data-label="${(lvl.label||'').replace(/"/g,'&quot;')}" ${isAssigned ? 'checked' : ''} style="accent-color:var(--accent);">
        <span style="width:10px;height:10px;border-radius:50%;background:${lvl.color || '#94a3b8'};flex-shrink:0;"></span>
        <span style="font-size:13px;font-weight:500;color:var(--text);flex:1;">${lvl.label || 'Unnamed'}</span>
        ${otherFilter ? `<span style="font-size:10px;color:var(--warm);font-weight:500;">${otherFilter.map(f=>f.name).join(', ')}</span>` : ''}
      `;
      checksEl.appendChild(row);
    });

    // Bind checkbox changes with overlap detection
    checksEl.querySelectorAll('.fl-level-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const label = cb.dataset.label;
        if (cb.checked) {
          const otherFilter = otherAssignments[label];
          if (otherFilter && otherFilter.length > 0) {
            // Overlap detected — show resolution popup
            showLevelOverlapPopup(label, otherFilter, (action) => {
              if (action === 'take') {
                // Remove from other filters
                otherFilter.forEach(f => {
                  const other = savedFilters[f.idx];
                  if (other && other.assignedLevels) {
                    other.assignedLevels = other.assignedLevels.filter(l => l !== label);
                  }
                });
                saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
                assignedLevels.push(label);
              } else if (action === 'other') {
                // Remove from other filters, don't add to this one — it becomes "Other"
                otherFilter.forEach(f => {
                  const other = savedFilters[f.idx];
                  if (other && other.assignedLevels) {
                    other.assignedLevels = other.assignedLevels.filter(l => l !== label);
                  }
                });
                saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
                cb.checked = false;
              } else {
                cb.checked = false; // cancelled
              }
              renderModal();
            });
            return;
          }
          assignedLevels.push(label);
        } else {
          assignedLevels = assignedLevels.filter(l => l !== label);
        }
        renderModal();
      });
    });

    // Include Other toggle
    const otherCb = overlay.querySelector('#fl-include-other');
    if (otherCb) {
      otherCb.addEventListener('change', () => { includeOther = otherCb.checked; });
    }

    // Render hierarchy table
    const tbody = overlay.querySelector('#fl-tbody');
    filterLevels.forEach((lvl, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="level-rank">${i + 1}</td>
        <td><input class="level-name" data-i="${i}" data-f="label" value="${(lvl.label||'').replace(/"/g,'&quot;')}" placeholder="Level name"></td>
        <td><input data-i="${i}" data-f="keywords" value="${(lvl.keywords||'').replace(/"/g,'&quot;')}" placeholder="keyword1, keyword2"></td>
        <td><button class="level-del" data-i="${i}" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        filterLevels[parseInt(inp.dataset.i)][inp.dataset.f] = inp.value.trim();
      });
    });
    tbody.querySelectorAll('.level-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const lbl = filterLevels[parseInt(btn.dataset.i)].label;
        filterLevels.splice(parseInt(btn.dataset.i), 1);
        assignedLevels = assignedLevels.filter(l => l !== lbl);
        renderModal();
      });
    });

    overlay.querySelector('#fl-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#fl-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#fl-add').addEventListener('click', () => {
      filterLevels.push({ label: '', keywords: '', color: '#94a3b8' });
      renderModal();
    });
    overlay.querySelector('#fl-reset').addEventListener('click', () => {
      filterLevels = JSON.parse(JSON.stringify(levelHierarchy));
      delete savedFilters[filterIdx].levelHierarchy;
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      renderModal();
    });
    overlay.querySelector('#fl-save').addEventListener('click', () => {
      savedFilters[filterIdx].levelHierarchy = JSON.parse(JSON.stringify(filterLevels));
      savedFilters[filterIdx].assignedLevels = assignedLevels.length > 0 ? [...assignedLevels] : undefined;
      savedFilters[filterIdx].includeOtherLevels = assignedLevels.length > 0 ? includeOther : undefined;
      saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
      overlay.remove();
      renderSavedFilters();
      debouncedSearchJobs();
    });
  }

  renderModal();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

// Level overlap resolution popup
function showLevelOverlapPopup(levelLabel, otherFilters, callback) {
  const names = otherFilters.map(f => f.name).join(' & ');
  const popup = document.createElement('div');
  popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10001;display:flex;align-items:center;justify-content:center;';
  popup.innerHTML = `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:400px;width:90%;">
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px;">Level Overlap</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;line-height:1.6;">
        <strong style="color:var(--warm);">${levelLabel}</strong> is already assigned to <strong>${names}</strong>. What would you like to do?
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <button id="lo-take" style="padding:10px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent-glow);color:var(--accent);font-size:12px;font-weight:600;cursor:pointer;text-align:left;">
          Assign to this filter<br><span style="font-weight:400;font-size:10px;color:var(--text-faint);">Remove from ${names}</span>
        </button>
        <button id="lo-other" style="padding:10px 16px;border-radius:8px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-dim);font-size:12px;font-weight:600;cursor:pointer;text-align:left;">
          Move to Other Levels<br><span style="font-weight:400;font-size:10px;color:var(--text-faint);">Unassign from ${names}, available as "Other"</span>
        </button>
        <button id="lo-cancel" style="padding:8px 16px;border:none;background:none;color:var(--text-faint);font-size:11px;cursor:pointer;">Cancel</button>
      </div>
    </div>`;
  popup.querySelector('#lo-take').addEventListener('click', () => { popup.remove(); callback('take'); });
  popup.querySelector('#lo-other').addEventListener('click', () => { popup.remove(); callback('other'); });
  popup.querySelector('#lo-cancel').addEventListener('click', () => { popup.remove(); callback('cancel'); });
  popup.addEventListener('click', e => { if (e.target === popup) { popup.remove(); callback('cancel'); } });
  document.body.appendChild(popup);
}


// Render tuning pills
function renderTuningPills() {
  const tuningOnRemove = () => { saveTuning(); renderTuningPills(); updateTuningBadges(); };
  renderPillsFor(tuningLocExclPills, '#tuning-location-exclude', '#tuning-loc-excl-input', false, 'not-pill', tuningOnRemove);
  renderPillsFor(tuningTitleExclPills, '#tuning-title-exclude', '#tuning-title-excl-input', false, 'not-pill', tuningOnRemove);
  renderPillsFor(tuningCoExclPills, '#tuning-company-exclude', '#tuning-co-excl-input', false, 'not-pill', tuningOnRemove);
  // Industry pills — render as not-pills with remove buttons
  const indBuilder = $('#tuning-industry-exclude');
  const indInput = $('#tuning-ind-excl-input');
  if (indBuilder) {
    indBuilder.querySelectorAll('.qb-pill').forEach(p => p.remove());
    tuningIndExclPills.forEach((pill, i) => {
      const name = typeof pill === 'string' ? pill : (pill.values ? pill.values[0] : pill);
      const span = document.createElement('span');
      span.className = 'qb-pill not-pill';
      span.innerHTML = `${name} <span class="qb-pill-x" data-idx="${i}">✕</span>`;
      indBuilder.insertBefore(span, indInput);
    });
    // Attach remove handlers
    indBuilder.querySelectorAll('.qb-pill-x').forEach(x => {
      x.addEventListener('click', e => {
        const idx = parseInt(e.target.dataset.idx);
        tuningIndExclPills.splice(idx, 1);
        saveTuning(); renderTuningPills();
      });
    });
  }
}
renderTuningPills();
updateTuningStatusDot();

function updateTuningBadges() {
  // Location: count pills + US-only checkbox
  const locCount = tuningLocExclPills.length + ($('#tuning-us-only')?.checked ? 1 : 0);
  const locBadge = $('#tc-loc-badge');
  if (locBadge) {
    locBadge.textContent = locCount > 0 ? `${locCount} rule${locCount > 1 ? 's' : ''}` : '';
    locBadge.classList.toggle('empty', locCount === 0);
  }

  // Company
  const coCount = tuningCoExclPills.length;
  const coBadge = $('#tc-co-badge');
  if (coBadge) {
    coBadge.textContent = coCount > 0 ? `${coCount} excluded` : '';
    coBadge.classList.toggle('empty', coCount === 0);
  }

  // Industry
  const indCount = tuningIndExclPills.length;
  const indBadge = $('#tc-ind-badge');
  if (indBadge) {
    indBadge.textContent = indCount > 0 ? `${indCount} excluded` : '';
    indBadge.classList.toggle('empty', indCount === 0);
  }

  // Title: count exclusion pills + level count
  const titleExclCount = tuningTitleExclPills.length;
  const levelCount = (tuningSettings.levelHierarchy || []).length;
  const titleBadge = $('#tc-title-badge');
  if (titleBadge) {
    const parts = [];
    if (levelCount > 0) parts.push(`${levelCount} levels`);
    if (titleExclCount > 0) parts.push(`${titleExclCount} excluded`);
    titleBadge.textContent = parts.length > 0 ? parts.join(' · ') : '';
    titleBadge.classList.toggle('empty', parts.length === 0);
  }

  // Poor matches
  const poorCount = hiddenJobIds ? hiddenJobIds.length : 0;
  const poorBadge = $('#tc-poor-badge');
  if (poorBadge) {
    poorBadge.textContent = poorCount > 0 ? `${poorCount} hidden` : '';
    poorBadge.classList.toggle('empty', poorCount === 0);
  }
}
updateTuningBadges();

// ---- Industry typeahead ----
let industryCache = null; // { industries: [{name, category}], loaded: bool }
let industryDropdownIdx = -1;

async function loadIndustryCache() {
  if (industryCache) return industryCache;
  // Use cachedQuery (v3.84) — pre-warmed on app init, 1h TTL
  try {
    industryCache = await cachedQuery('ref:industries', function() {
      return sb.from('ref_industries').select('name, category').order('name');
    }, { ttl: 3600000 }) || [];
  } catch (e) {
    reportError('tuning', e);
    console.warn('[BJ] Failed to load industries:', e);
    industryCache = [];
  }
  return industryCache;
}

async function searchIndustries(query) {
  const industries = await loadIndustryCache();
  const q = query.toLowerCase().trim();
  if (!q) return industries.slice(0, 20);
  return industries.filter(ind =>
    ind.name.includes(q) || (ind.category || '').toLowerCase().includes(q)
  ).slice(0, 15);
}

function renderIndustryDropdown(results) {
  const dd = $('#industry-dropdown');
  if (!results || results.length === 0) { dd.classList.remove('open'); return; }
  industryDropdownIdx = -1;

  // Category badge colors
  const catColors = {
    'Technology': '#3b82f6', 'Healthcare': '#ef4444', 'Finance': '#f59e0b',
    'Education': '#8b5cf6', 'Marketing': '#ec4899', 'Engineering': '#06b6d4',
    'Manufacturing': '#6b7280', 'Energy': '#f97316', 'Real Estate': '#84cc16',
    'Retail & Consumer': '#14b8a6', 'Government': '#6366f1', 'Legal': '#a855f7',
    'Media & Entertainment': '#e879f9', 'Nonprofit': '#22c55e', 'Professional Services': '#64748b',
    'Logistics': '#0ea5e9', 'Other': '#9ca3af',
  };

  // Filter out already-selected industries
  const existing = new Set(tuningIndExclPills.map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p)));
  const filtered = results.filter(r => !existing.has(r.name));
  if (filtered.length === 0) { dd.classList.remove('open'); return; }

  dd.innerHTML = filtered.map((ind, i) => {
    const cat = ind.category || 'Other';
    const color = catColors[cat] || '#9ca3af';
    return `<div class="company-opt" tabindex="0" data-name="${ind.name}" data-idx="${i}">
      <span style="font-weight:500;">${ind.name}</span>
      <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:${color}22;color:${color};font-weight:600;">${cat}</span>
    </div>`;
  }).join('');
  dd.classList.add('open');

  // Click handlers on options
  dd.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault();
      selectIndustryFromDropdown(opt.dataset.name);
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); selectIndustryFromDropdown(opt.dataset.name); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else $('#tuning-ind-excl-input').focus(); }
      if (e.key === 'Escape') { dd.classList.remove('open'); $('#tuning-ind-excl-input').focus(); }
    });
  });
}

function selectIndustryFromDropdown(name) {
  if (!name) return;
  const existing = tuningIndExclPills.map(p => typeof p === 'string' ? p : (p.values ? p.values[0] : p));
  if (!existing.includes(name)) {
    tuningIndExclPills.push(name);
    saveTuning();
    renderTuningPills();
  }
  const input = $('#tuning-ind-excl-input');
  input.value = '';
  $('#industry-dropdown').classList.remove('open');
  industryDropdownIdx = -1;
}

// Wire up industry input
(function() {
  const input = $('#tuning-ind-excl-input');
  const dd = $('#industry-dropdown');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const results = await searchIndustries(input.value);
      renderIndustryDropdown(results);
    }, 150);
  });

  input.addEventListener('focus', async () => {
    if (input.value.length === 0) {
      const results = await searchIndustries('');
      renderIndustryDropdown(results);
    }
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) selectIndustryFromDropdown(focused.dataset.name);
      }
    }
    if (e.key === 'Backspace' && input.value === '' && tuningIndExclPills.length > 0) {
      tuningIndExclPills.pop();
      saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    // Delay to allow mousedown on dropdown to fire first
    setTimeout(() => { dd.classList.remove('open'); }, 150);
  });

  // Close dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-industry-exclude') && !e.target.closest('#industry-dropdown')) {
      dd.classList.remove('open');
    }
  });

  // Click on builder area focuses input
  $('#tuning-industry-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// Also refresh badges whenever tuning pills change
const _origRenderTuningPills = renderTuningPills;
renderTuningPills = function() { _origRenderTuningPills(); updateTuningBadges(); updateTuningStatusDot(); };

// Tuning input handlers (title only — generic pill commit)
const tuningInputs = [
  { input: '#tuning-title-excl-input', pills: () => tuningTitleExclPills, set: v => { tuningTitleExclPills = v; tuningSettings.titleExcludes = v; }, builder: '#tuning-title-exclude' },
];
tuningInputs.forEach(t => {
  const el = $(t.input);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(el, t.pills(), raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    } else if (e.key === 'Backspace' && el.value === '' && t.pills().length > 0) {
      t.pills().pop(); saveTuning(); renderTuningPills();
    }
  });
  el.addEventListener('blur', () => {
    commitPill(el, t.pills(), raw => ({ values: [raw], type: 'not' }));
    saveTuning(); renderTuningPills();
  });
  $(t.builder).addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) el.focus();
  });
});

// ---- Location Exclusion typeahead (Tuning) ----
(function() {
  const input = $('#tuning-loc-excl-input');
  const dd = $('#tuning-location-dropdown');
  if (!input || !dd) return;

  const badgeMap = {
    state: '<span style="font-size:9px;background:rgba(139,92,246,0.1);color:#8b5cf6;padding:1px 6px;border-radius:4px;font-weight:600;">state</span>',
    metro: '<span style="font-size:9px;background:rgba(245,158,11,0.1);color:#f59e0b;padding:1px 6px;border-radius:4px;font-weight:600;">metro</span>',
    city: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">city</span>',
    remote: '<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">remote</span>',
    country: '<span style="font-size:9px;background:rgba(14,165,233,0.1);color:#0ea5e9;padding:1px 6px;border-radius:4px;font-weight:600;">country</span>',
    pin: '<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">📍</span>',
  };

  let debounceTimer;

  async function searchTuningLocations(query) {
    const ql = query.toLowerCase().trim();
    const results = [];
    const seenKeys = new Set();

    // US states
    const US_STATES = {
      'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas','CA':'California',
      'CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia',
      'HI':'Hawaii','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas',
      'KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts',
      'MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana',
      'NE':'Nebraska','NV':'Nevada','NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico',
      'NY':'New York','NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma',
      'OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina','SD':'South Dakota',
      'TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington',
      'WV':'West Virginia','WI':'Wisconsin','WY':'Wyoming','DC':'District of Columbia',
    };

    const stateMatches = Object.entries(US_STATES).filter(([code, name]) =>
      code.toLowerCase() === ql || name.toLowerCase().startsWith(ql)
    );
    for (const [code, name] of stateMatches) {
      const key = `state:${code}`;
      if (!seenKeys.has(key)) { seenKeys.add(key); results.push({ display: `${name} (${code})`, badge: 'state' }); }
    }

    // ref_city_radius
    try {
      const refData = await safeQuery(() => sb.from('ref_city_radius').select('city, state, type')
        .or(`city.ilike.%${query}%,aliases.cs.{${query}}`).limit(10), { label: 'tuning:ref_city_radius', fallback: [] });
      if (refData) {
        for (const r of refData) {
          const display = r.type === 'metro' ? r.city : `${r.city}, ${r.state}`;
          const key = display.toLowerCase();
          if (!seenKeys.has(key)) { seenKeys.add(key); results.push({ display, badge: r.type === 'metro' ? 'metro' : 'city' }); }
        }
      }
    } catch(e) { reportError('tuning:tuning', e); }

    // location_cache
    try {
      const cacheData = await safeQuery(() => sb.from('location_cache').select('raw_input, normalized')
        .or(`raw_input.ilike.%${query}%,normalized.ilike.%${query}%`).limit(8), { label: 'tuning:location_cache', fallback: [] });
      if (cacheData) {
        for (const loc of cacheData) {
          const display = loc.normalized || loc.raw_input;
          const key = display.toLowerCase();
          if (!seenKeys.has(key) && !key.startsWith('remote')) { seenKeys.add(key); results.push({ display, badge: 'pin' }); }
        }
      }
    } catch(e) { reportError('tuning:tuning', e); }

    // Countries
    var COUNTRIES = ['Afghanistan','Albania','Algeria','Andorra','Angola','Argentina','Armenia','Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh','Barbados','Belarus','Belgium','Belize','Benin','Bhutan','Bolivia','Bosnia and Herzegovina','Botswana','Brazil','Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon','Canada','Central African Republic','Chad','Chile','China','Colombia','Comoros','Congo','Costa Rica','Croatia','Cuba','Cyprus','Czech Republic','Czechia','Denmark','Djibouti','Dominican Republic','DR Congo','Ecuador','Egypt','El Salvador','Equatorial Guinea','Eritrea','Estonia','Eswatini','Ethiopia','Fiji','Finland','France','Gabon','Gambia','Georgia','Germany','Ghana','Greece','Grenada','Guatemala','Guinea','Guyana','Haiti','Honduras','Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland','Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan','Kenya','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon','Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta','Mauritania','Mauritius','Mexico','Moldova','Monaco','Mongolia','Montenegro','Morocco','Mozambique','Myanmar','Namibia','Nepal','Netherlands','New Zealand','Nicaragua','Niger','Nigeria','North Korea','North Macedonia','Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea','Paraguay','Peru','Philippines','Poland','Portugal','Qatar','Romania','Russia','Rwanda','Saudi Arabia','Senegal','Serbia','Sierra Leone','Singapore','Slovakia','Slovenia','Somalia','South Africa','South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden','Switzerland','Syria','Taiwan','Tajikistan','Tanzania','Thailand','Togo','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan','Uganda','Ukraine','United Arab Emirates','United Kingdom','UK','United States','Uruguay','Uzbekistan','Venezuela','Vietnam','Yemen','Zambia','Zimbabwe'];
    var countryMatches = COUNTRIES.filter(c => c.toLowerCase().startsWith(ql) || c.toLowerCase().includes(ql));
    for (var ci = 0; ci < Math.min(countryMatches.length, 5); ci++) {
      var cKey = 'country:' + countryMatches[ci].toLowerCase();
      if (!seenKeys.has(cKey)) { seenKeys.add(cKey); results.push({ display: countryMatches[ci], badge: 'country' }); }
    }

    // Remote
    if ('remote'.startsWith(ql)) {
      if (!seenKeys.has('remote')) { seenKeys.add('remote'); results.push({ display: 'Remote', badge: 'remote' }); }
    }

    return results.slice(0, 10);
  }

  function renderTuningLocDropdown(results, query) {
    // Filter out already-excluded
    const existing = new Set(tuningLocExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    }));
    const filtered = results.filter(r => !existing.has(r.display.toLowerCase()));
    if (filtered.length === 0) { dd.classList.remove('open'); return; }

    dd.innerHTML = filtered.map(r => {
      const badge = badgeMap[r.badge] || '';
      const hl = highlightCompanyMatch(r.display, query);
      return `<div class="company-opt" tabindex="0" data-name="${r.display.replace(/"/g,'&quot;')}">
        <span style="font-weight:500;">${hl}</span>${badge}</div>`;
    }).join('');
    dd.classList.add('open');

    dd.querySelectorAll('.company-opt').forEach(opt => {
      opt.addEventListener('mousedown', e => { e.preventDefault(); selectTuningLocation(opt.dataset.name); });
      opt.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); selectTuningLocation(opt.dataset.name); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else input.focus(); }
        if (e.key === 'Escape') { dd.classList.remove('open'); input.focus(); }
      });
    });
  }

  function selectTuningLocation(name) {
    if (!name) return;
    const existing = tuningLocExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    });
    if (!existing.includes(name.toLowerCase())) {
      tuningLocExclPills.push({ values: [name.toLowerCase()], type: 'not' });
      saveTuning();
      renderTuningPills();
    }
    input.value = '';
    dd.classList.remove('open');
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { dd.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const results = await searchTuningLocations(q);
      renderTuningLocDropdown(results, q);
    }, 200);
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) {
          selectTuningLocation(focused.dataset.name);
        } else {
          commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
          saveTuning(); renderTuningPills();
          dd.classList.remove('open');
        }
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    }
    if (e.key === 'Backspace' && input.value === '' && tuningLocExclPills.length > 0) {
      tuningLocExclPills.pop(); saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      dd.classList.remove('open');
      if (input.value.trim()) {
        commitPill(input, tuningLocExclPills, raw => ({ values: [raw], type: 'not' }));
        saveTuning(); renderTuningPills();
      }
    }, 150);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-location-exclude') && !e.target.closest('#tuning-location-dropdown')) {
      dd.classList.remove('open');
    }
  });

  $('#tuning-location-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// ---- Company Exclusion typeahead ----
(function() {
  const input = $('#tuning-co-excl-input');
  const dd = $('#tuning-company-dropdown');
  if (!input || !dd) return;

  let debounceTimer;

  async function searchTuningCompanies(query) {
    const results = [];
    try {
      const { data: atsData } = await sb
        .from('ats_companies')
        .select('slug, name, source')
        .or(`slug.ilike.%${query}%,name.ilike.%${query}%`)
        .limit(6);
      if (atsData) {
        atsData.forEach(c => results.push({
          name: c.name || c.slug, slug: c.slug, source: 'ats', ats: c.source || 'greenhouse'
        }));
      }
    } catch(e) { reportError('tuning:tuning', e); }

    try {
      const { data: connData } = await sb
        .from('connections')
        .select('parsed_company')
        .ilike('parsed_company', `%${query}%`)
        .not('parsed_company', 'is', null)
        .limit(30);
      if (connData) {
        const counts = {};
        connData.forEach(p => {
          const n = (p.parsed_company || '').trim();
          if (n) counts[n] = (counts[n] || 0) + 1;
        });
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .forEach(([name, count]) => {
            if (!results.find(r => r.name.toLowerCase() === name.toLowerCase())) {
              results.push({ name, source: 'network', connections: count });
            }
          });
      }
    } catch(e) { reportError('tuning:tuning', e); }

    return results;
  }

  function renderTuningCompanyDropdown(results, query) {
    // Filter out already-excluded companies
    const existing = new Set(tuningCoExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    }));
    const filtered = results.filter(r => !existing.has(r.name.toLowerCase()));
    if (filtered.length === 0) { dd.classList.remove('open'); return; }

    dd.innerHTML = filtered.map(r => {
      const badge = r.source === 'network'
        ? `<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">${r.connections} conn</span>`
        : `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.ats || 'ats'}</span>`;
      const hl = highlightCompanyMatch(r.name, query);
      return `<div class="company-opt" tabindex="0" data-name="${r.name.replace(/"/g, '&quot;')}">
        <span style="font-weight:500;">${hl}</span>${badge}</div>`;
    }).join('');
    dd.classList.add('open');

    dd.querySelectorAll('.company-opt').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        selectTuningCompany(opt.dataset.name);
      });
      opt.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); selectTuningCompany(opt.dataset.name); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else input.focus(); }
        if (e.key === 'Escape') { dd.classList.remove('open'); input.focus(); }
      });
    });
  }

  function selectTuningCompany(name) {
    if (!name) return;
    const existing = tuningCoExclPills.map(p => {
      if (typeof p === 'string') return p.toLowerCase();
      return ((p.values || [])[0] || '').toLowerCase();
    });
    if (!existing.includes(name.toLowerCase())) {
      tuningCoExclPills.push({ values: [name], type: 'not' });
      saveTuning();
      renderTuningPills();
    }
    input.value = '';
    dd.classList.remove('open');
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { dd.classList.remove('open'); return; }
    debounceTimer = setTimeout(async () => {
      const results = await searchTuningCompanies(q);
      renderTuningCompanyDropdown(results, q);
    }, 200);
  });

  input.addEventListener('keydown', e => {
    if (dd.classList.contains('open')) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = dd.querySelector('.company-opt');
        if (first) first.focus();
      } else if (e.key === 'Escape') {
        dd.classList.remove('open');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const focused = dd.querySelector('.company-opt:focus');
        if (focused) {
          selectTuningCompany(focused.dataset.name);
        } else {
          // Manual entry — commit as plain text pill
          commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
          saveTuning(); renderTuningPills();
          dd.classList.remove('open');
        }
      }
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
      saveTuning(); renderTuningPills();
    }
    if (e.key === 'Backspace' && input.value === '' && tuningCoExclPills.length > 0) {
      tuningCoExclPills.pop(); saveTuning(); renderTuningPills();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      dd.classList.remove('open');
      // Commit any remaining text
      if (input.value.trim()) {
        commitPill(input, tuningCoExclPills, raw => ({ values: [raw], type: 'not' }));
        saveTuning(); renderTuningPills();
      }
    }, 150);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('#tuning-company-exclude') && !e.target.closest('#tuning-company-dropdown')) {
      dd.classList.remove('open');
    }
  });

  $('#tuning-company-exclude').addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) input.focus();
  });
})();

// Checkboxes
$('#tuning-us-only').addEventListener('change', () => { saveTuning(); updateTuningBadges(); });
if ($('#tuning-exclude-hourly')) $('#tuning-exclude-hourly').addEventListener('change', () => { saveTuning(); updateTuningBadges(); });
if ($('#tuning-exclude-staffing')) $('#tuning-exclude-staffing').addEventListener('change', () => { saveTuning(); updateTuningBadges(); });

// Analyze hidden jobs for poor match suggestions
async function updatePoorMatchSuggestions() {
  const container = $('#tuning-poor-matches');
  const sugContainer = $('#tuning-suggestions');

  if (hiddenJobIds.length === 0) {
    container.innerHTML = '<span style="color:var(--text-faint);font-size:12px;">Nothing dismissed yet. When you hide jobs from the feed, they appear here — and we start learning what to filter out automatically.</span>';
    if (sugContainer) sugContainer.innerHTML = '';
    return;
  }

  // Backfill any hidden jobs missing title/company from Supabase
  const needsBackfill = hiddenJobIds.filter(h => !h.title);
  if (needsBackfill.length > 0) {
    const ids = needsBackfill.map(h => h.id);
    const jobRows = await safeQuery(() => sb.from('ats_jobs').select('greenhouse_id, title, company_name, company_slug, url')
      .in('greenhouse_id', ids), { label: 'tuning:ats_jobs', fallback: [] });
    if (jobRows) {
      const lookup = Object.fromEntries(jobRows.map(j => [j.greenhouse_id, j]));
      let changed = false;
      hiddenJobIds.forEach(h => {
        if (!h.title && lookup[h.id]) {
          h.title = lookup[h.id].title || '';
          h.company = lookup[h.id].company_name || '';
          h.url = lookup[h.id].url || '';
          h.companySlug = lookup[h.id].company_slug || '';
          changed = true;
        }
      });
      if (changed) saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
    }
  }

  // Show recent hidden jobs (newest first, max 20)
  const recent = [...hiddenJobIds].reverse().slice(0, 20);
  let html = `<div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">${hiddenJobIds.length} dismissed job${hiddenJobIds.length !== 1 ? 's' : ''}</div>`;

  // Pre-compute title word frequencies for per-card annotations
  const stopWords = new Set(['the','and','or','a','an','of','for','in','at','to','with','on','is','are','we','our','this','that','you','your','it','as','be','by','from','has','have','will','can','do','all','not','but','if','so','no','up','about','into','out','just','new','one','its','been','more','also','was','were','than','other','they','had','each','very','how','may']);
  const titleWordCounts = {};
  const companyCountsAll = {};
  hiddenJobIds.forEach(h => {
    if (h.title) {
      const words = h.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      const seen = new Set();
      words.forEach(w => { if (!seen.has(w)) { titleWordCounts[w] = (titleWordCounts[w] || 0) + 1; seen.add(w); } });
    }
    if (h.company) {
      const co = h.company.trim();
      if (co) companyCountsAll[co] = (companyCountsAll[co] || 0) + 1;
    }
  });

  recent.forEach((h, i) => {
    const reasonLabel = HIDE_REASONS.find(r => r.key === h.reason)?.label || h.reason || 'Hidden';
    const dateStr = h.hiddenAt ? new Date(h.hiddenAt).toLocaleDateString() : '';
    const titleText = h.title || 'Unknown Job';
    const jobUrl = h.url && h.url.startsWith('http') ? h.url : h.url ? 'https://boards.greenhouse.io' + h.url : (h.companySlug ? `https://boards.greenhouse.io/${h.companySlug}/jobs/${h.id}` : '');
    const titleHtml = jobUrl
      ? `<a href="${jobUrl}" target="_blank" rel="noopener" style="color:var(--text);text-decoration:none;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">${titleText}</a>`
      : titleText;

    // Per-card pattern notes: show recurring keywords from this job's title
    let patternNote = '';
    if (h.title) {
      const words = h.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
      const recurring = words.filter(w => titleWordCounts[w] >= 2);
      if (recurring.length > 0) {
        const unique = [...new Set(recurring)].slice(0, 3);
        patternNote = `<div style="font-size:10px;color:var(--warm);margin-top:2px;">You've dismissed ${Math.max(...unique.map(w => titleWordCounts[w]))} jobs with "${unique.join('", "')}" — block this pattern?</div>`;
      }
    }
    if (!patternNote && h.company && companyCountsAll[h.company.trim()] >= 2) {
      patternNote = `<div style="font-size:10px;color:var(--warm);margin-top:2px;">You've dismissed ${companyCountsAll[h.company.trim()]} jobs from ${h.company} — block this company?</div>`;
    }

    html += `<div class="poor-match-card">
      <div class="poor-match-info">
        <div class="poor-match-title" title="${(h.title||'').replace(/"/g,'&quot;')}">${titleHtml}</div>
        <div class="poor-match-meta">${h.company || ''}${dateStr ? ' · ' + dateStr : ''}</div>
        ${patternNote}
      </div>
      <span class="poor-match-reason">${reasonLabel}</span>
      <button class="poor-match-unhide" onclick="analyzeHiddenJob('${h.id}', this)" style="background:linear-gradient(135deg,rgba(167,139,250,0.15),rgba(77,142,255,0.15));color:var(--accent);border:1px solid rgba(77,142,255,0.3);" title="Analyze this job and create a rule so similar ones stop appearing">✦ Block Similar</button>
      <button class="poor-match-unhide" onclick="unhideJob('${h.id}', this)">Unhide</button>
    </div>`;
  });

  if (hiddenJobIds.length > 20) {
    html += `<div style="font-size:11px;color:var(--text-faint);margin-top:8px;text-align:center;">+ ${hiddenJobIds.length - 20} more hidden</div>`;
  }

  container.innerHTML = html;

  // Pattern analysis — suggest exclusions based on common words in hidden job titles/companies
  if (!sugContainer) return;

  // Get tuning exclusions to avoid suggesting already-excluded terms
  const tuning = safeReadLS('bj_tuning', {});
  const existingTitleExcl = new Set((tuning.titleExcludes || []).map(t => t.toLowerCase()));
  const existingCoExcl = new Set((tuning.companyExcludes || []).map(c => c.toLowerCase()));

  const titleSuggestions = Object.entries(titleWordCounts)
    .filter(([w, c]) => c >= 2 && !existingTitleExcl.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const companySuggestions = Object.entries(companyCountsAll)
    .filter(([co, c]) => c >= 2 && !existingCoExcl.has(co.toLowerCase()))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (titleSuggestions.length === 0 && companySuggestions.length === 0) {
    sugContainer.innerHTML = '';
    return;
  }

  let sugHtml = '<div style="font-size:11px;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Patterns We Found</div>';

  if (titleSuggestions.length > 0) {
    const topWord = titleSuggestions[0];
    sugHtml += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;padding:8px 12px;background:var(--bg-input);border-radius:8px;border-left:3px solid var(--warm);">The word <strong>"${topWord[0]}"</strong> shows up in ${topWord[1]} of the ${hiddenJobIds.length} jobs you've dismissed. Add it as a rule and these stop appearing in your feed.</div>`;
    sugHtml += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:6px;">Click any keyword to block jobs containing it:</div><div style="display:flex;flex-wrap:wrap;gap:0;">';
    titleSuggestions.forEach(([word, count]) => {
      sugHtml += `<span class="suggestion-chip" onclick="addSuggestedExclusion('title', '${word}', this)">${word} <span class="chip-count">×${count}</span> <span style="color:var(--accent);">+</span></span>`;
    });
    sugHtml += '</div>';
  }

  if (companySuggestions.length > 0) {
    sugHtml += '<div style="font-size:11px;color:var(--text-faint);margin:10px 0 6px;">Companies you keep dismissing — click to block all future jobs from them:</div><div style="display:flex;flex-wrap:wrap;gap:0;">';
    companySuggestions.forEach(([co, count]) => {
      sugHtml += `<span class="suggestion-chip" onclick="addSuggestedExclusion('company', '${co.replace(/'/g, "\\'")}', this)">${co} <span class="chip-count">×${count}</span> <span style="color:var(--accent);">+</span></span>`;
    });
    sugHtml += '</div>';
  }

  sugContainer.innerHTML = sugHtml;
}

window.unhideJob = function(jobId, btn) {
  hiddenJobIds = hiddenJobIds.filter(h => h.id !== jobId);
  saveUserData('bj_hidden_jobs', JSON.stringify(hiddenJobIds));
  const card = btn.closest('.poor-match-card');
  if (card) card.style.opacity = '0.3';
  setTimeout(() => updatePoorMatchSuggestions(), 300);
};

window.addSuggestedExclusion = function(type, term, chip) {
  if (type === 'title') {
    if (!tuningTitleExclPills.some(t => t.toLowerCase() === term.toLowerCase())) {
      tuningTitleExclPills.push(term);
    }
  } else if (type === 'company') {
    if (!tuningCoExclPills.some(c => c.toLowerCase() === term.toLowerCase())) {
      tuningCoExclPills.push(term);
    }
  }
  saveTuning();
  renderTuningPills();
  // Visual feedback
  chip.style.background = 'var(--green-dim)';
  chip.style.borderColor = 'var(--green)';
  chip.style.color = 'var(--green)';
  chip.innerHTML = `✓ ${term} added`;
  chip.style.pointerEvents = 'none';
};

updatePoorMatchSuggestions();



// ─── Feature 2: AI Analysis of Hidden Jobs ───

window.analyzeHiddenJob = async function(jobId, btn) {
  // Find the hidden job record
  var hidden = hiddenJobIds.find(function(h) { return h.id === jobId; });
  if (!hidden) return;

  // Get resume text — prefer the resume linked to the source filter, fall back to any
  var allResumes = (typeof resumes !== 'undefined' ? resumes : []).filter(function(r) {
    return !r.archived;
  });
  var resumesWithText = allResumes.filter(function(r) {
    return r.extractedText && r.extractedText.length > 100;
  });

  // Try to find the resume linked to the source filter
  var resume = null;
  if (hidden.filterIdxs && hidden.filterIdxs.length > 0 && typeof savedFilters !== 'undefined') {
    var srcFilter = savedFilters[hidden.filterIdxs[0]];
    if (srcFilter && srcFilter.name) {
      var linkedResume = resumesWithText.find(function(r) {
        return (r.filterIds || []).includes(srcFilter.name);
      });
      if (linkedResume) resume = linkedResume;
    }
  }
  // Fall back to most recent resume with text
  if (!resume) resume = resumesWithText.length > 0 ? resumesWithText[resumesWithText.length - 1] : null;

  // Get the source filter's pills if available
  var filterPills = null;
  if (hidden.filterIdxs && hidden.filterIdxs.length > 0 && typeof savedFilters !== 'undefined') {
    var srcFilter = savedFilters[hidden.filterIdxs[0]];
    if (srcFilter) {
      filterPills = {
        what: (srcFilter.whatPills || []).map(function(p) { return p.values; }).flat(),
        where: (srcFilter.wherePills || []).map(function(p) { return p.values; }).flat(),
        whatNot: (srcFilter.whatNotPills || []).map(function(p) { return p.values; }).flat(),
        whoNot: (srcFilter.whoNotPills || []).map(function(p) { return p.values; }).flat()
      };
    }
  }
  
  // Show modal with loading
  var modal = document.getElementById('ai-filter-modal');
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var meta = document.getElementById('ai-filter-meta');
  var titleEl = modal.querySelector('.job-modal-title');
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  footer.style.display = 'none';
  titleEl.textContent = '✦ Improve Filter';
  meta.textContent = 'Analyzing: ' + (hidden.title || 'Hidden job') + ' at ' + (hidden.company || '');
  body.innerHTML = '<div style="text-align:center;padding:60px 20px;">' +
    '<div class="loading-spinner" style="margin:0 auto 16px;"></div>' +
    '<div style="color:var(--text-dim);font-size:13px;">AI is analyzing why this was a poor match…</div></div>';
  
  try {
    var session = null;
    try { session = (await sb.auth.getSession()).data.session; } catch(e) { reportError('tuning:tuning', e); }
    if (!session) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Please sign in to use AI features.</div>';
      return;
    }
    
    var resp = await fetch(SUPABASE_URL + '/functions/v1/analyze-hidden-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        job_id: jobId,
        resume_text: resume ? resume.extractedText.slice(0, 6000) : null,
        filter_pills: filterPills
      })
    });
    
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return { error: 'Request failed' }; });
      var statusMsg = resp.status === 404 ? 'Edge function not deployed. Run: supabase functions deploy analyze-hidden-job'
        : resp.status === 500 ? 'Server error — check ANTHROPIC_API_KEY in Supabase Edge Function secrets'
        : resp.status === 401 ? 'Please sign in again — your session may have expired'
        : (err.error || 'AI analysis failed (status ' + resp.status + ')');
      body.innerHTML = '<div style="text-align:center;padding:40px;"><div style="color:var(--red);font-weight:600;margin-bottom:8px;">' + statusMsg + '</div>' +
        '<button class="btn btn-sm btn-primary" style="margin-top:12px;" onclick="document.getElementById(\'ai-filter-modal\').style.display=\'none\';document.body.style.overflow=\'\';">OK</button></div>';
      return;
    }
    
    var data = await resp.json();
    // Store for accept handler
    window._analyzeHiddenData = data;
    window._analyzeHiddenFilterIdxs = hidden.filterIdxs || [];
    renderAnalyzeHiddenPreview(data, hidden);
    
  } catch (err) {
    reportError('tuning', err);
    console.error('[Analyze Hidden]', err);
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red);">Error: ' + err.message + '</div>';
  }
}

function renderAnalyzeHiddenPreview(data, hidden) {
  var body = document.getElementById('ai-filter-body');
  var footer = document.getElementById('ai-filter-footer');
  var acceptBtn = document.getElementById('ai-filter-accept');
  
  var html = '';
  
  // Mismatch summary
  if (data.mismatch_summary) {
    html += '<div style="padding:12px 16px;background:var(--bg);border-radius:8px;margin-bottom:20px;border-left:3px solid var(--accent);">';
    html += '<div style="font-size:13px;color:var(--text);line-height:1.5;">' + data.mismatch_summary + '</div>';
    html += '</div>';
  }
  
  // Target filter selector
  var filterIdxs = window._analyzeHiddenFilterIdxs || [];
  if (filterIdxs.length > 0 && typeof savedFilters !== 'undefined' && savedFilters[filterIdxs[0]]) {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">Adding exclusions to: <strong style="color:var(--text);">' + savedFilters[filterIdxs[0]].name + '</strong></div>';
  } else {
    html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:16px;">';
    html += '<label>Add exclusions to: <select id="analyze-target-filter" style="background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:2px 6px;font-size:11px;margin-left:4px;">';
    if (typeof savedFilters !== 'undefined') {
      savedFilters.forEach(function(sf, i) {
        html += '<option value="' + i + '">' + sf.name + '</option>';
      });
    }
    html += '</select></label></div>';
  }
  
  // Suggestions
  var sections = [
    { key: 'what_not', label: 'WHAT NOT — Exclude these title keywords', items: data.what_not || [], color: '#f87171' },
    { key: 'where_not', label: 'WHERE NOT — Exclude these locations', items: data.where_not || [], color: '#f59e0b' },
    { key: 'who_not', label: 'WHO NOT — Exclude these companies', items: data.who_not || [], color: '#fb923c' }
  ];
  
  var hasSuggestions = false;
  sections.forEach(function(sec) {
    if (sec.items.length === 0) return;
    hasSuggestions = true;
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + sec.label + '</div>';
    sec.items.forEach(function(item, i) {
      html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:4px;">';
      html += '<input type="checkbox" checked data-section="' + sec.key + '" data-index="' + i + '" style="accent-color:' + sec.color + ';">';
      html += '<span style="color:var(--text);font-weight:500;">' + item.term + '</span>';
      html += '<span style="color:var(--text-faint);font-size:10px;margin-left:auto;">' + item.reason + '</span>';
      html += '</label>';
    });
    html += '</div>';
  });
  
  if (!hasSuggestions) {
    html += '<div style="text-align:center;padding:20px;color:var(--text-faint);font-size:13px;">No specific exclusions suggested. The mismatch may be too subtle for simple keyword filtering.</div>';
  }
  
  body.innerHTML = html;
  footer.style.display = hasSuggestions ? 'flex' : 'none';
  
  // Change accept button text and handler
  if (acceptBtn) {
    acceptBtn.textContent = 'Add to Filter';
    acceptBtn.onclick = acceptAnalyzeHidden;
  }
}

function acceptAnalyzeHidden() {
  var data = window._analyzeHiddenData;
  if (!data) return;
  
  // Determine target filter
  var filterIdx = -1;
  var filterIdxs = window._analyzeHiddenFilterIdxs || [];
  if (filterIdxs.length > 0) {
    filterIdx = filterIdxs[0];
  } else {
    var sel = document.getElementById('analyze-target-filter');
    if (sel) filterIdx = parseInt(sel.value);
  }
  
  if (filterIdx < 0 || !savedFilters[filterIdx]) {
    alert('No valid filter selected.');
    return;
  }
  
  var filter = savedFilters[filterIdx];
  
  // Collect checked items
  document.querySelectorAll('#ai-filter-body input[type="checkbox"][data-section]:checked').forEach(function(cb) {
    var sec = cb.dataset.section;
    var idx = parseInt(cb.dataset.index);
    var items = sec === 'what_not' ? data.what_not : sec === 'where_not' ? data.where_not : data.who_not;
    var item = items[idx];
    if (!item) return;
    
    var pill = { values: [item.term], type: sec === 'where_not' ? 'location' : 'keyword' };
    
    if (sec === 'what_not') {
      if (!filter.whatNotPills) filter.whatNotPills = [];
      // Don't duplicate
      if (!filter.whatNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whatNotPills.push(pill);
      }
    } else if (sec === 'where_not') {
      if (!filter.whereNotPills) filter.whereNotPills = [];
      if (!filter.whereNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whereNotPills.push(pill);
      }
    } else if (sec === 'who_not') {
      if (!filter.whoNotPills) filter.whoNotPills = [];
      if (!filter.whoNotPills.some(function(p) { return p.values[0] === item.term; })) {
        filter.whoNotPills.push(pill);
      }
    }
  });
  
  // Save updated filter
  saveUserData('bj_saved_filters', JSON.stringify(savedFilters));
  
  // Close modal
  closeAiFilterModal();
  window._analyzeHiddenData = null;
  window._analyzeHiddenFilterIdxs = null;
  
  // Refresh
  if (typeof renderSavedFilters === 'function') renderSavedFilters();
  if (typeof debouncedSearchJobs === 'function') debouncedSearchJobs();
}

// CS-P1-004 FE-005: Register tuning.js exports with BJ namespace
(function() {
  ['editFilterLevelHierarchy', 'unhideJob', 'addSuggestedExclusion', 'analyzeHiddenJob'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'tuning', registered: Date.now() };
    }
  });
})();
