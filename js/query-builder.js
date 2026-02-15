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

function allPills() { return whatPills.length + wherePills.length + whenPills.length + whoPills.length + payPills.length + whatNotPills.length + whereNotPills.length + whoNotPills.length; }

function renderPillsFor(pillArray, builderId, inputId, isLocation, extraClass, onRemove) {
  const builder = $(builderId);
  builder.querySelectorAll('.qb-pill, .qb-and').forEach(el => el.remove());
  const input = $(inputId);

  pillArray.forEach((pill, i) => {
    if (i > 0) {
      const andEl = document.createElement('span');
      andEl.className = 'qb-and';
      andEl.textContent = 'AND';
      builder.insertBefore(andEl, input);
    }

    const el = document.createElement('span');
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

    let display;
    if (pill.type === 'collection') {
      display = `📂 ${pill.collectionName}<span class="coll-count">(${pill.values.length})</span>`;
    } else if (isLocation) {
      const textParts = pill.values.map(v => `<span>${v}</span>`);
      const joined = pill.values.length > 1
        ? textParts.join(`<span class="or-sep">${orLabel}</span>`)
        : textParts[0];
      // Show badge for geo-enabled pills
      let badge = '';
      if (pill.locType === 'state') {
        badge = `<span class="pill-radius" style="color:#8b5cf6;">state</span>`;
      } else if (pill.locType === 'metro') {
        badge = `<span class="pill-radius" style="color:#f59e0b;">${Math.round(pill.radius_mi)}mi</span>`;
      } else if (pill.radius_mi) {
        badge = `<span class="pill-radius">${Math.round(pill.radius_mi)}mi</span>`;
      }
      display = `${joined}${badge}`;
    } else {
      const textParts = pill.values.map(v => `<span>${v}</span>`);
      display = pill.values.length > 1
        ? textParts.join(`<span class="or-sep">${orLabel}</span>`)
        : textParts[0];
    }

    el.innerHTML = `<span class="qb-pill-text" data-idx="${i}">${display}</span><span class="qb-pill-remove" data-idx="${i}">×</span>`;
    builder.insertBefore(el, input);
  });

  // Bind pill click — add OR term inline (or open collection popup)
  builder.querySelectorAll('.qb-pill-text').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      const pill = pillArray[idx];

      // Collection pills open the edit popup
      if (pill && pill.type === 'collection') {
        openCollectionPopup(pill, pillArray, idx);
        return;
      }

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

  // Bind remove
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

  // Show/hide toolbar
  const hasAny = allPills() > 0;
  $('#save-filter-row').style.display = hasAny ? 'inline-flex' : 'none';
  $('#clear-filters-btn').style.display = hasAny ? '' : 'none';
  // Always show saved filters if any exist
  $('#saved-filters-section').style.display = savedFilters.length > 0 ? '' : 'none';

  // Update collapse badge count
  const count = allPills();
  const badge = $('#qb-active-count');
  if (count > 0) { badge.textContent = count + ' filter' + (count > 1 ? 's' : ''); badge.style.display = ''; }
  else { badge.style.display = 'none'; }

  // Trigger job search when filters change (only from filter builder)
  if (allPills() > 0) debouncedSearchJobs();
}

