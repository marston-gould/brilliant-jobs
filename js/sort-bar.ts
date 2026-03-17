// ============================================================
// SORT BAR — Visible multi-sort with numbered pills
// ============================================================

function renderSortPills() {
  const container = $('#sort-pills');
  if (!container) return;

  // Dedup guard — remove duplicate fields, keep first occurrence
  const seen = new Set();
  jobSortStack = jobSortStack.filter(s => {
    if (seen.has(s.field)) return false;
    seen.add(s.field);
    return true;
  });

  // Clear existing pills before re-rendering
  container.querySelectorAll('.sort-pill').forEach(p => p.remove());

  // Color map matching filter row colors: title=blue, company=pink, location=amber, salary=green, days=purple, ghost=red
  const sortColorMap = {
    title: { bg: 'rgba(61,126,255,0.1)', text: 'var(--accent)', dot: 'var(--accent)' },
    company_name: { bg: 'rgba(236,72,153,0.1)', text: '#ec4899', dot: '#ec4899' },
    location: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b', dot: '#f59e0b' },
    updated_at: { bg: 'rgba(168,85,247,0.1)', text: '#a855f7', dot: '#a855f7' },
    level: { bg: 'rgba(6,182,212,0.1)', text: '#06b6d4', dot: '#06b6d4' },
    fraud_score: { bg: 'rgba(34,197,94,0.1)', text: '#22c55e', dot: '#22c55e' },
  };
  jobSortStack.forEach((s, i) => {
    const labelMap = { updated_at: 'Days', title: 'Title', company_name: 'Company', location: 'Location', level: 'Level', fraud_score: 'Trust' };
    const label = labelMap[s.field] || s.field;
    const dirLabel = s.asc ? '↑' : '↓';
    const dirTitle = s.asc
      ? (s.field === 'first_seen_at' ? 'Oldest first — click to flip' : s.field === 'level' ? 'Lowest first — click to flip' : 'A→Z — click to flip')
      : (s.field === 'first_seen_at' ? 'Newest first — click to flip' : s.field === 'level' ? 'Highest first — click to flip' : 'Z→A — click to flip');
    const colors = sortColorMap[s.field] || sortColorMap.title;

    const pill = document.createElement('span');
    pill.className = 'sort-pill';
    pill.style.background = colors.bg;
    pill.style.color = colors.text;
    pill.innerHTML = `
      <span class="sort-num" style="background:${colors.dot};">${i + 1}</span>
      ${escapeHtml(label)}
      <span class="sort-dir" title="${escapeHtml(dirTitle)}" data-idx="${i}">${dirLabel}</span>
      <span class="sort-remove" title="Remove" data-idx="${i}">✕</span>
    `;
    container.appendChild(pill);
  });

  // Bind direction toggle
  container.querySelectorAll('.sort-dir').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      jobSortStack[idx].asc = !jobSortStack[idx].asc;
      renderSortPills();
      searchJobs(0);
    });
  });

  // Bind remove
  container.querySelectorAll('.sort-remove').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      jobSortStack.splice(idx, 1);
      if (jobSortStack.length === 0) jobSortStack.push({ field: 'first_seen_at', asc: false });
      renderSortPills();
      searchJobs(0);
    });
  });

  // Update dropdown — disable already-used fields
  $$('#sort-dropdown .sort-opt').forEach(opt => {
    const inUse = jobSortStack.some(s => s.field === opt.dataset.field);
    opt.classList.toggle('disabled', inUse);

  // QA-010: Update sort indicators on table headers and sort bar buttons
  const dbToSort = { title: 'title', company_name: 'company', location: 'location', first_seen_at: 'days', level: 'level', match: 'match', salary_max: 'salary', ghost_rate: 'ghost' };
  $$('.job-table th[data-sort], .sort-btn[data-sort]').forEach(el => {
    el.classList.remove('sorted');
    el.style.borderColor = '';
    el.style.color = '';
    var arrow = el.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = '↕';
  });
  if (jobSortStack.length > 0) {
    var primarySort = jobSortStack[0];
    var sortAttr = dbToSort[primarySort.field];
    if (sortAttr) {
      var activeEl = document.querySelector('.sort-btn[data-sort="' + sortAttr + '"], .job-table th[data-sort="' + sortAttr + '"]');
      if (activeEl) {
        activeEl.classList.add('sorted');
        activeEl.style.borderColor = 'var(--accent)';
        activeEl.style.color = 'var(--text)';
        var arrow = activeEl.querySelector('.sort-arrow');
        if (arrow) arrow.textContent = primarySort.asc ? '↑' : '↓';
      }
    }
  }
  });
}

// Function declarations (must be top-level for cross-file access)
async function searchCompanies(query) {
  const results = [];
  try {
    // Search ats_companies by slug or name
    const { data: atsData, error: atsErr } = await sb
      .from('ats_companies')
      .select('slug, name, source')
      .or(`slug.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(6);
    if (atsErr) console.warn('[BJ] ATS company search error:', atsErr.message);
    if (atsData) {
      atsData.forEach(c => results.push({
        name: c.name || c.slug, slug: c.slug, source: 'ats', ats: c.source || 'greenhouse'
      }));
    }
  } catch(e) { reportError('sort-bar', e); console.warn('[BJ] ATS company search failed:', e); }

  try {
    // Search user's connections by parsed_company
    const { data: connData, error: connErr } = await sb
      .from('connections')
      .select('parsed_company')
      .ilike('parsed_company', `%${query}%`)
      .not('parsed_company', 'is', null)
      .limit(30);
    if (connErr) console.warn('[BJ] Connection company search error:', connErr.message);
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
  } catch(e) { reportError('sort-bar', e); console.warn('[BJ] Connection company search failed:', e); }

  renderCompanyDropdown(results, query);
}

function commitPill(input, pillArray, makePill, conflictArray) {
  const raw = input.value.trim().toLowerCase();
  if (!raw) return false;
  // Duplicate check — same value already in this array
  if (pillArray.some(p => (p.values || []).some(v => v.toLowerCase() === raw))) {
    input.value = '';
    return false;
  }
  // Conflict check — same value already in the opposite array (e.g. WHAT vs NOT)
  if (conflictArray && conflictArray.some(p => (p.values || []).some(v => v.toLowerCase() === raw))) {
    input.style.borderColor = 'var(--red)';
    input.title = '"' + raw + '" is already in the opposite filter';
    setTimeout(() => { input.style.borderColor = ''; input.title = ''; }, 2500);
    input.value = '';
    return false;
  }
  pillArray.push(makePill(raw));
  input.value = '';
  renderAllPills();
  return true;
}

function focusNextInput(currentId) {
  const idx = qbInputOrder.indexOf(currentId);
  if (idx >= 0 && idx < qbInputOrder.length - 1) {
    const next = $('#' + qbInputOrder[idx + 1]);
    if (next) setTimeout(() => next.focus(), 10);
  }
}

function renderCompanyDropdown(results, query) {
  if (results.length === 0) { companyDropdown.classList.remove('open'); return; }
  companyDropdown.innerHTML = results.map(r => {
    const badge = r.source === 'network'
      ? `<span style="font-size:9px;background:rgba(52,211,153,0.1);color:var(--green);padding:1px 6px;border-radius:4px;font-weight:600;">${r.connections} conn</span>`
      : `<span style="font-size:9px;background:rgba(99,102,241,0.1);color:#6366f1;padding:1px 6px;border-radius:4px;font-weight:600;">${r.ats}</span>`;
    const hl = highlightCompanyMatch(r.name, query);
    return `<div class="company-opt" tabindex="0" data-name="${r.name.replace(/"/g, '&quot;')}">
      <span style="font-weight:500;">${hl}</span>${badge}</div>`;
  }).join('');
  companyDropdown.classList.add('open');

  companyDropdown.querySelectorAll('.company-opt').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur from firing first
      qbInputWho.value = opt.dataset.name;
      commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
      renderAllPills();
      companyDropdown.classList.remove('open');
    });
    opt.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); opt.dispatchEvent(new Event('mousedown')); }
      if (e.key === 'ArrowDown') { e.preventDefault(); const n = opt.nextElementSibling; if (n) n.focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); const p = opt.previousElementSibling; if (p) p.focus(); else qbInputWho.focus(); }
      if (e.key === 'Escape') { companyDropdown.classList.remove('open'); qbInputWho.focus(); }
    });
  });
}

function highlightCompanyMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) +
    '<strong style="color:var(--accent);">' + text.slice(idx, idx + query.length) + '</strong>' +
    text.slice(idx + query.length);
}

// Guard: only run imperative DOM code if dashboard elements exist
if ($('#sort-pills')) {

// Sort add button + dropdown
$('#sort-add-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const dd = $('#sort-dropdown');
  dd.style.display = dd.style.display === 'none' ? '' : 'none';
});

$$('#sort-dropdown .sort-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    const field = opt.dataset.field;
    if (jobSortStack.some(s => s.field === field)) return;
    const defaultAsc = field === 'title' || field === 'company_name' || field === 'location';
    jobSortStack.push({ field, asc: field === 'level' ? false : (field === 'fraud_score' ? true : defaultAsc) });
    // PostHog: fraud_sort_applied
    if (field === 'fraud_score' && typeof posthog !== 'undefined') {
      posthog.capture('fraud_sort_applied', { direction: defaultAsc ? 'asc' : 'desc' });
    }
    $('#sort-dropdown').style.display = 'none';
    renderSortPills();
    searchJobs(0);
  });
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target || e.target.nodeType !== 1) return;
  if (!e.target.closest('.sort-add-wrap')) {
    $('#sort-dropdown').style.display = 'none';
  }
});

// Also allow clicking table headers or sort bar buttons as a quick single-sort shortcut
$$('.job-table th[data-sort], .sort-btn[data-sort]').forEach(th => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    const field = th.dataset.sort;
    const fieldMap = { title: 'title', company: 'company_name', location: 'location', days: 'first_seen_at', level: 'level', match: 'match', salary: 'salary_max', ghost: 'ghost_rate' };
    const dbField = fieldMap[field] || 'updated_at';

    // If already primary sort, toggle direction
    if (jobSortStack.length > 0 && jobSortStack[0].field === dbField) {
      jobSortStack[0].asc = !jobSortStack[0].asc;
    } else {
      // Make it the primary sort (keep others)
      jobSortStack = jobSortStack.filter(s => s.field !== dbField);
      jobSortStack.unshift({ field: dbField, asc: field === 'title' || field === 'company' || field === 'location' });
    }
    renderSortPills();
    searchJobs(0);
  });
});

// Initial render of sort pills
renderSortPills();

// Input handling — What row
const qbInputWhat = $('#qb-input-what');


const qbInputOrder = ['qb-input-what', 'qb-input-where', 'qb-input-when', 'qb-input-who'];



qbInputWhat.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }), whatNotPills);
  } else if (e.key === 'Tab') {
    if (qbInputWhat.value.trim()) {
      e.preventDefault();
      commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }), whatNotPills);
      focusNextInput('qb-input-what');
    }
  } else if (e.key === 'Backspace' && qbInputWhat.value === '' && whatPills.length > 0) {
    whatPills.pop();
    renderAllPills();
  }
});
qbInputWhat.addEventListener('blur', () => {
  commitPill(qbInputWhat, whatPills, raw => ({ values: [raw], type: classifyTerm(raw) }), whatNotPills);
});

// Input handling — Where row (handled by location autocomplete section below)

// Click builders to focus respective inputs
$('#query-builder-what')?.addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  qbInputWhat.focus();
});
$('#query-builder-where')?.addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  qbInputWhere.focus();
});
$('#query-builder-when')?.addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  $('#qb-input-when').focus();
});
$('#query-builder-who')?.addEventListener('click', e => {
  if (e.target.closest('.qb-pill')) return;
  $('#qb-input-who').focus();
});

// Input handling — When row
const qbInputWhen = $('#qb-input-when');

function commitWhenPill() {
  const raw = qbInputWhen.value.trim();
  if (!raw) return;
  // Validate & normalize
  const norm = normalizeWhenValue(raw);
  if (!norm) {
    // Show inline error
    qbInputWhen.style.borderColor = 'var(--red)';
    qbInputWhen.style.color = 'var(--red)';
    let errEl = qbInputWhen.parentElement.querySelector('.when-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'when-error';
      errEl.style.cssText = 'font-size:10px;color:var(--red);margin-top:2px;position:absolute;bottom:-14px;left:0;white-space:nowrap;';
      qbInputWhen.parentElement.style.position = 'relative';
      qbInputWhen.parentElement.appendChild(errEl);
    }
    errEl.textContent = 'Try: today, yesterday, 7 days, 2 weeks, month, 3 months';
    setTimeout(() => {
      qbInputWhen.style.borderColor = '';
      qbInputWhen.style.color = '';
      if (errEl) errEl.remove();
    }, 4000);
    return;
  }
  // Use the normalized canonical label
  qbInputWhen.value = '';
  whenPills.push({ values: [norm.label], type: 'when' });
  renderAllPills();
}

qbInputWhen.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    commitWhenPill();
  } else if (e.key === 'Tab') {
    if (qbInputWhen.value.trim()) {
      e.preventDefault();
      commitWhenPill();
      focusNextInput('qb-input-when');
    }
  } else if (e.key === 'Backspace' && qbInputWhen.value === '' && whenPills.length > 0) {
    whenPills.pop();
    renderAllPills();
  }
});
qbInputWhen.addEventListener('blur', () => {
  commitWhenPill();
});

// Input handling — Who row
const qbInputWho = $('#qb-input-who');
qbInputWho.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
    // If dropdown is open, force selection from it
    if (companyDropdown.classList.contains('open')) {
      const first = companyDropdown.querySelector('.company-opt');
      if (first) {
        e.preventDefault();
        qbInputWho.value = first.dataset.name;
        commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
        renderAllPills();
        companyDropdown.classList.remove('open');
        return;
      }
    }
    if (e.key === 'Enter' || e.key === ',') e.preventDefault();
    commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
    companyDropdown.classList.remove('open');
  } else if (e.key === 'Backspace' && qbInputWho.value === '' && whoPills.length > 0) {
    whoPills.pop();
    renderAllPills();
  } else if (e.key === 'Escape') {
    companyDropdown.classList.remove('open');
  } else if (e.key === 'ArrowDown' && companyDropdown.classList.contains('open')) {
    e.preventDefault();
    const first = companyDropdown.querySelector('.company-opt');
    if (first) first.focus();
  }
});
qbInputWho.addEventListener('blur', () => {
  commitPill(qbInputWho, whoPills, raw => ({ values: [raw], type: 'who' }));
  setTimeout(() => { $('#company-dropdown').classList.remove('open'); }, 200);
});

// Company autocomplete
let companySearchTimeout = null;
const companyDropdown = $('#company-dropdown');

qbInputWho.addEventListener('input', () => {
  const q = qbInputWho.value.trim();
  if (q.length < 2) { companyDropdown.classList.remove('open'); return; }
  clearTimeout(companySearchTimeout);
  companySearchTimeout = setTimeout(() => searchCompanies(q), 200);
});


// searchCompanies defined above guard







// ============================================================
// SKILLS input bindings
// ============================================================
const qbInputSkills = $('#qb-input-skills');
if (qbInputSkills) {
  qbInputSkills.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(qbInputSkills, skillsPills, raw => ({ values: [raw.toLowerCase()], type: 'skills' }));
    } else if (e.key === 'Backspace' && qbInputSkills.value === '' && skillsPills.length > 0) {
      skillsPills.pop();
      renderAllPills();
    }
  });
  qbInputSkills.addEventListener('blur', () => {
    commitPill(qbInputSkills, skillsPills, raw => ({ values: [raw.toLowerCase()], type: 'skills' }));
  });
  $('#query-builder-skills')?.addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) qbInputSkills.focus();
  });
}

// ============================================================
// LEVEL input bindings
// ============================================================
const qbInputLevel = $('#qb-input-level');
if (qbInputLevel) {
  qbInputLevel.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(qbInputLevel, levelPills, raw => ({ values: [raw.toLowerCase()], type: 'level' }));
    } else if (e.key === 'Backspace' && qbInputLevel.value === '' && levelPills.length > 0) {
      levelPills.pop();
      renderAllPills();
    }
  });
  qbInputLevel.addEventListener('blur', () => {
    commitPill(qbInputLevel, levelPills, raw => ({ values: [raw.toLowerCase()], type: 'level' }));
  });
  $('#query-builder-level')?.addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) qbInputLevel.focus();
  });
}

// ============================================================
// JD CONTAINS input bindings
// ============================================================
const qbInputJd = $('#qb-input-jd');
if (qbInputJd) {
  qbInputJd.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPill(qbInputJd, jdPills, raw => ({ values: [raw], type: 'jd' }));
    } else if (e.key === 'Backspace' && qbInputJd.value === '' && jdPills.length > 0) {
      jdPills.pop();
      renderAllPills();
    }
  });
  qbInputJd.addEventListener('blur', () => {
    commitPill(qbInputJd, jdPills, raw => ({ values: [raw], type: 'jd' }));
  });
  $('#query-builder-jd')?.addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) qbInputJd.focus();
  });
}



// ============================================================
// DEPARTMENT input bindings
// ============================================================
const qbInputDept = $('#qb-input-dept');
if (qbInputDept) {
  qbInputDept.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitPill(qbInputDept, deptPills, raw => ({ values: [raw.toLowerCase()], type: 'dept' }));
    } else if (e.key === 'Backspace' && qbInputDept.value === '' && deptPills.length > 0) {
      deptPills.pop();
      renderAllPills();
    }
  });
  qbInputDept.addEventListener('blur', () => {
    commitPill(qbInputDept, deptPills, raw => ({ values: [raw.toLowerCase()], type: 'dept' }));
  });
  $('#query-builder-dept')?.addEventListener('click', e => {
    if (!e.target.closest('.qb-pill')) qbInputDept.focus();
  });
}

} // end sort-bar guard
