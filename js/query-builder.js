// ============================================================
// JOBS — TAG QUERY BUILDER
// ============================================================
// Each pill is { values: ['term1','term2'], type: 'keyword'|'salary'|'type'|'location' }
// whatPills = keyword/salary/type pills, wherePills = location pills
// Multiple values in one pill = OR, multiple pills = AND

function classifyTerm(term) {
  const lower = term.toLowerCase().trim();
  if (WORKPLACE_WORDS.includes(lower.replace('-',''))) return 'type';
  if (SALARY_RE.test(lower) || /^\d{4,}$/.test(lower)) return 'salary';
  return 'keyword';
}

function allPills() { return whatPills.length + wherePills.length + whenPills.length + whoPills.length + payPills.length + whatNotPills.length + whereNotPills.length + whoNotPills.length + skillsPills.length + levelPills.length + jdPills.length + deptPills.length; }

function renderPillsFor(pillArray, builderId, inputId, isLocation, extraClass, onRemove) {
  const builder = $(builderId);
  builder.querySelectorAll('.qb-pill, .qb-and').forEach(el => el.remove());
  const input = $(inputId);

  const isNot = extraClass && extraClass.includes('not-pill');
  const sepLabel = isNot ? 'AND' : 'or';

  pillArray.forEach((pill, i) => {
    if (i > 0) {
      const andEl = document.createElement('span');
      andEl.className = 'qb-and';
      andEl.textContent = sepLabel;
      builder.insertBefore(andEl, input);
    }

    const el = document.createElement('span');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', 'Filter: ' + pill.values.join(' or ') + '. Press Delete to remove.');
    let cls = 'qb-pill';
    if (pill.type === 'collection') cls += ' collection-pill';
    else if (extraClass) cls += ' ' + extraClass;
    else if (isLocation) cls += ' location-pill';
    else if (pill.values.length > 1) cls += ' or-group';
    else if (pill.type === 'salary') cls += ' salary-pill';
    else if (pill.type === 'type') cls += ' type-pill';
    el.className = cls;

    const isNot = extraClass && extraClass.includes('not-pill');
    const orLabel = isNot ? ' nor ' : ' or ';
    const isMulti = pill.values.length > 1 && pill.type !== 'collection';

    let display;
    if (pill.type === 'collection') {
      display = `📂 ${escapeHtml(pill.collectionName)}<span class="coll-count">(${pill.values.length})</span>`;
    } else if (isMulti) {
      // Multi-value: each value gets its own × button
      const parts = pill.values.map((v, vi) => {
        let valHtml = `<span class="qb-val-item" data-pill="${i}" data-val="${vi}">`;
        valHtml += `<span class="qb-val-text">${escapeHtml(v)}</span>`;
        valHtml += `<span class="qb-val-remove" data-pill="${i}" data-val="${vi}" title="Remove '${escapeHtml(v)}'">×</span>`;
        valHtml += `</span>`;
        return valHtml;
      });
      // Location badge
      let badge = '';
      if (isLocation) {
        if (pill.locType === 'state') badge = `<span class="pill-radius" style="color:#8b5cf6;">state</span>`;
        else if (pill.locType === 'metro') badge = `<span class="pill-radius" style="color:#f59e0b;">${Math.round(pill.radius_mi)}mi</span>`;
        else if (pill.radius_mi) badge = `<span class="pill-radius">${Math.round(pill.radius_mi)}mi</span>`;
      }
      display = parts.join(`<span class="or-sep">${orLabel}</span>`) + badge;
    } else if (isLocation) {
      const textParts = pill.values.map(v => `<span>${v}</span>`);
      const joined = textParts[0];
      let badge = '';
      if (pill.locType === 'state') badge = `<span class="pill-radius" style="color:#8b5cf6;">state</span>`;
      else if (pill.locType === 'metro') badge = `<span class="pill-radius" style="color:#f59e0b;">${Math.round(pill.radius_mi)}mi</span>`;
      else if (pill.radius_mi) badge = `<span class="pill-radius">${Math.round(pill.radius_mi)}mi</span>`;
      display = `${joined}${badge}`;
    } else {
      display = `<span>${pill.values[0]}</span>`;
    }

    el.innerHTML = `<span class="qb-pill-text" data-idx="${i}">${display}</span><span class="qb-pill-remove" data-idx="${i}">×</span>`;
    builder.insertBefore(el, input);

    // Q26: Keyboard navigation
    el.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        pillArray.splice(i, 1);
        if (onRemove) onRemove();
        else renderAllPills();
        // Focus next pill or input
        const nextPill = builder.querySelector('.qb-pill');
        if (nextPill) nextPill.focus();
        else input.focus();
      } else if (e.key === 'ArrowRight') {
        const next = el.nextElementSibling;
        if (next && next.classList.contains('qb-and')) {
          const pill2 = next.nextElementSibling;
          if (pill2 && pill2.classList.contains('qb-pill')) pill2.focus();
        } else if (next && next.classList.contains('qb-pill')) next.focus();
        else input.focus();
      } else if (e.key === 'ArrowLeft') {
        const prev = el.previousElementSibling;
        if (prev && prev.classList.contains('qb-and')) {
          const pill2 = prev.previousElementSibling;
          if (pill2 && pill2.classList.contains('qb-pill')) pill2.focus();
        } else if (prev && prev.classList.contains('qb-pill')) prev.focus();
      }
    });
  });

  // Bind per-value remove buttons (for multi-value pills)
  builder.querySelectorAll('.qb-val-remove').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const pi = parseInt(el.dataset.pill);
      const vi = parseInt(el.dataset.val);
      if (pillArray[pi]) {
        pillArray[pi].values.splice(vi, 1);
        // If only 0 values left, remove the pill entirely
        if (pillArray[pi].values.length === 0) {
          pillArray.splice(pi, 1);
        }
        if (onRemove) onRemove();
        else renderAllPills();
      }
    });
  });

  // Bind pill text click — add OR term inline (only for location/collection pills)
  builder.querySelectorAll('.qb-pill-text').forEach(el => {
    el.addEventListener('click', e => {
      // If they clicked a per-value remove, don't open input
      if (e.target.classList.contains('qb-val-remove')) return;

      const idx = parseInt(el.dataset.idx);
      const pill = pillArray[idx];

      // Collection pills open the edit popup
      if (pill && pill.type === 'collection') {
        openCollectionPopup(pill, pillArray, idx);
        return;
      }

      // Only location pills get inline OR input
      if (!isLocation) return;

      const existing = builder.querySelector('.qb-or-input');
      if (existing) existing.remove();
      const orInput = document.createElement('input');
      orInput.type = 'text';
      orInput.className = 'qb-input qb-or-input';
      orInput.style.maxWidth = '140px';
      orInput.placeholder = isLocation ? 'or city…' : 'or …';
      orInput.dataset.targetIdx = idx;
      const pillEl = el.closest('.qb-pill');
      pillEl.after(orInput);
      orInput.focus();
      orInput.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') {
          const val = orInput.value.trim();
          if (val) {
            pillArray[idx].values.push(val);
          }
          orInput.remove();
          renderAllPills();
        }
        if (ev.key === 'Escape') { orInput.remove(); }
      });
      orInput.addEventListener('blur', () => { orInput.remove(); });
    });
  });

  // Bind pill-level remove (removes entire pill group)
  builder.querySelectorAll('.qb-pill-remove').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      pillArray.splice(parseInt(el.dataset.idx), 1);
      if (onRemove) onRemove();
      else renderAllPills();
    });
  });
}

function renderAllPills() {
  renderPillsFor(whatPills, '#query-builder-what', '#qb-input-what', false, '');
  renderPillsFor(whatNotPills, '#query-builder-what-not', '#qb-input-what-not', false, 'not-pill');
  renderPillsFor(wherePills, '#query-builder-where', '#qb-input-where', true, '');
  renderPillsFor(whereNotPills, '#query-builder-where-not', '#qb-input-where-not', false, 'not-pill');
  renderPillsFor(whenPills, '#query-builder-when', '#qb-input-when', false, 'when-pill');
  renderPillsFor(whoPills, '#query-builder-who', '#qb-input-who', false, 'who-pill');
  renderPillsFor(whoNotPills, '#query-builder-who-not', '#qb-input-who-not', false, 'not-pill');
  renderPayPills();
  renderPillsFor(skillsPills, '#query-builder-skills', '#qb-input-skills', false, 'skills-pill');
  renderPillsFor(levelPills, '#query-builder-level', '#qb-input-level', false, 'level-pill');
  renderPillsFor(jdPills, '#query-builder-jd', '#qb-input-jd', false, 'jd-pill');
  renderPillsFor(deptPills, '#query-builder-dept', '#qb-input-dept', false, 'dept-pill');

  // Show/hide toolbar
  const hasAny = allPills() > 0;
  $('#save-filter-row').style.display = hasAny ? 'inline-flex' : 'none';
  $('#clear-filters-btn').style.display = hasAny ? '' : 'none';
  // Always show saved filters if any exist (v7.69: use classList to match location.js pattern — style.display='' does not override u-hidden CSS class)
  $('#saved-filters-section').classList.toggle('u-hidden', savedFilters.length === 0);

  // Update collapse badge count
  const count = allPills();
  const badge = $('#qb-active-count');
  if (count > 0) { badge.textContent = count + ' filter' + (count > 1 ? 's' : ''); badge.style.display = ''; }
  else { badge.style.display = 'none'; }

  // Trigger job search when filters change (only from filter builder)
  if (allPills() > 0) debouncedSearchJobs();
}

