// ============================================================
// PIPELINE — Table-based stage tracker (redesigned)
// ============================================================
const PL_STAGES = ['saved','applied','posting_closed','responded','interview','offer','rejected'];
const PL_STAGE_COLORS = {
  saved: 'var(--text-dim)', applied: 'var(--accent)', posting_closed: 'var(--warm)',
  responded: 'var(--green)', interview: 'var(--purple)', offer: 'var(--green)', rejected: 'var(--red)'
};

// Pipeline metadata per job — stage, dates, resume
function getPipelineMeta() {
  return JSON.parse(localStorage.getItem('bj_pipeline_meta') || '{}');
}
function savePipelineMeta(meta) {
  saveUserData('bj_pipeline_meta', JSON.stringify(meta));
}

// Migrate from old system on first load
function migratePipelineData() {
  const meta = getPipelineMeta();
  if (Object.keys(meta).length > 0) return; // Already migrated
  const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
  // Migrate applied jobs
  appliedJobIds.forEach(id => {
    meta[id] = {
      stage: 'applied',
      savedAt: dates[id] || new Date().toISOString(),
      appliedAt: dates[id] || new Date().toISOString(),
      resumeUsed: '',
      filterTags: []
    };
  });
  // Migrate saved-only jobs
  savedJobIds.filter(id => !appliedJobIds.includes(id)).forEach(id => {
    meta[id] = {
      stage: 'saved',
      savedAt: new Date().toISOString(),
      resumeUsed: '',
      filterTags: []
    };
  });
  savePipelineMeta(meta);
  console.log('[BJ] Pipeline data migrated:', Object.keys(meta).length, 'jobs');
}

// Move job to a new stage
function movePipelineStage(jobId, newStage) {
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = newStage;
  // Track stage dates
  if (newStage === 'applied' && !meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  if (newStage === 'responded' && !meta[jobId].respondedAt) meta[jobId].respondedAt = new Date().toISOString();
  if (newStage === 'interview' && !meta[jobId].interviewAt) meta[jobId].interviewAt = new Date().toISOString();
  if (newStage === 'offer' && !meta[jobId].offerAt) meta[jobId].offerAt = new Date().toISOString();
  if (newStage === 'rejected' && !meta[jobId].rejectedAt) meta[jobId].rejectedAt = new Date().toISOString();
  savePipelineMeta(meta);
  // Keep legacy arrays in sync
  if (newStage !== 'saved' && !appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
    saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
  }
  renderPipeline();
}

// Mark applied from feed
function markApplied(jobId, btn) {
  // Show resume picker, then complete
  showResumePicker(jobId, function(resumeName) {
    _completeMarkApplied(jobId, btn, resumeName);
  });
}

function _completeMarkApplied(jobId, btn, resumeName) {
  if (!appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
    saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
    if (btn) {
      const row = btn.closest('tr');
      if (row) {
        const actionsCell = row.querySelector('td:last-child');
        if (actionsCell) {
          const hideBtn = actionsCell.querySelector('.hide-btn');
          const hideBtnHtml = hideBtn ? hideBtn.outerHTML : '';
          actionsCell.innerHTML = '<span class="job-action-btn applied-btn">Applied \u2713</span>' + hideBtnHtml;
        }
      }
    }
  }
  // Update pipeline meta
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = 'applied';
  if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  // Store resume
  if (resumeName) {
    meta[jobId].resumeUsed = resumeName;
  }
  // Detect filter tags
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  meta[jobId].filterTags = checkedFilters;
  savePipelineMeta(meta);
  // Store applied date for legacy compat
  const dates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');
  dates[jobId] = new Date().toISOString();
  saveUserData('bj_applied_dates', JSON.stringify(dates));
}

function markAppliedFromPipeline(jobId, btn) {
  markApplied(jobId, btn);
  renderPipeline();
}

function unsaveFromPipeline(jobId) {
  const meta = getPipelineMeta();
  delete meta[jobId];
  savePipelineMeta(meta);
  const idx = savedJobIds.indexOf(jobId);
  if (idx >= 0) savedJobIds.splice(idx, 1);
  saveUserData('bj_saved_jobs', JSON.stringify(savedJobIds));
  const aidx = appliedJobIds.indexOf(jobId);
  if (aidx >= 0) appliedJobIds.splice(aidx, 1);
  saveUserData('bj_applied_jobs', JSON.stringify(appliedJobIds));
  $('#j-saved').textContent = savedJobIds.length.toLocaleString();
  renderPipeline();
}

// Collapse toggle
function togglePipelineStage(headerEl) {
  const section = headerEl.closest('.pl-stage-section');
  section.classList.toggle('collapsed');
  // Persist collapse state
  const states = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');
  states[section.dataset.stage] = section.classList.contains('collapsed');
  localStorage.setItem('bj_pl_collapse', JSON.stringify(states));
}

// Filter by saved filter tag
let _plActiveFilter = 'all';
function filterPipeline(tag) {
  _plActiveFilter = tag;
  renderPipeline();
}

// Build filter dropdown options
function buildPipelineFilterTags() {
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const select = $('#pl-filter-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Filters</option>';
  sf.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  select.value = currentVal || 'all';
}

// Main render
async function renderPipeline() {
  const meta = getPipelineMeta();
  const allIds = Object.keys(meta);
  if (allIds.length === 0) {
    PL_STAGES.forEach(stage => {
      const body = document.getElementById('pb-' + stage);
      if (body) body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      const count = document.getElementById('pc-' + stage);
      if (count) count.textContent = '0';
    });
    return;
  }

  // Fetch all pipeline jobs from Supabase
  const batchSize = 100;
  let allJobData = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    try {
      const { data } = await sb.from('ats_jobs')
        .select('greenhouse_id, title, company_name, location, loc_display, status, closed_at, first_seen_at, content, salary_min, salary_max')
        .in('greenhouse_id', batch);
      if (data) allJobData = allJobData.concat(data);
    } catch (e) { console.error('[BJ] Pipeline fetch error:', e); }
  }

  const jobMap = {};
  allJobData.forEach(j => { jobMap[j.greenhouse_id] = j; });

  // Auto-detect posting_closed
  allJobData.forEach(j => {
    if (j.status === 'closed' && meta[j.greenhouse_id] && meta[j.greenhouse_id].stage === 'applied') {
      meta[j.greenhouse_id].stage = 'posting_closed';
    }
  });
  savePipelineMeta(meta);

  const now = new Date();
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');

  // Restore collapse states
  const collapseStates = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');

  // Group by stage
  const stageJobs = {};
  PL_STAGES.forEach(s => { stageJobs[s] = []; });
  let totalTracked = 0, activeCount = 0, respondedCount = 0, totalDaysToResponse = 0;

  for (const [jobId, m] of Object.entries(meta)) {
    const stage = m.stage || 'saved';
    if (!stageJobs[stage]) continue;
    // Apply filter
    if (_plActiveFilter !== 'all' && !(m.filterTags || []).includes(_plActiveFilter)) continue;
    const job = jobMap[jobId];
    stageJobs[stage].push({ id: jobId, meta: m, job: job || null });
    totalTracked++;
    if (['applied','responded','interview'].includes(stage)) activeCount++;
    if (m.respondedAt && m.appliedAt) {
      respondedCount++;
      totalDaysToResponse += Math.floor((new Date(m.respondedAt) - new Date(m.appliedAt)) / 86400000);
    }
  }

  // Render each stage
  for (const stage of PL_STAGES) {
    const jobs = stageJobs[stage];
    const body = document.getElementById('pb-' + stage);
    const countEl = document.getElementById('pc-' + stage);
    const matchEl = document.getElementById('pm-' + stage);
    const section = body?.closest('.pl-stage-section');

    if (countEl) countEl.textContent = jobs.length;

    // Restore collapse
    if (section && collapseStates[stage]) section.classList.add('collapsed');

    // Match score summary
    const scores = jobs.map(j => j.meta.matchScore).filter(s => typeof s === 'number');
    if (matchEl) {
      if (scores.length > 0) {
        const median = scores.sort((a,b) => a - b)[Math.floor(scores.length / 2)];
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        matchEl.textContent = 'Match: ' + min + '% – ' + median + '% – ' + max + '%';
      } else {
        matchEl.textContent = '';
      }
    }

    if (!body) continue;
    if (jobs.length === 0) {
      body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      continue;
    }

    let html = '<table class="pl-table"><thead><tr>';
    html += '<th></th><th>Title</th><th>Company</th><th>Resume</th><th>Filters</th>';
    html += '<th>Discovered</th><th>Day Applied</th><th>Days In Stage</th>';
    html += '<th>Match</th><th>Move</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const item of jobs) {
      const j = item.job;
      const m = item.meta;
      const title = j ? (j.title || 'Untitled') : 'Unknown job';
      const company = j ? (j.company_name || '') : '';
      const discovered = j?.first_seen_at ? new Date(j.first_seen_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const appliedDate = m.appliedAt ? new Date(m.appliedAt) : null;
      const dayApplied = appliedDate ? appliedDate.toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const resumeName = m.resumeUsed || '—';

      // Days in current stage — use the most recent stage timestamp
      const stageDate = m.respondedAt ? new Date(m.respondedAt) :
                        m.appliedAt ? new Date(m.appliedAt) :
                        m.savedAt ? new Date(m.savedAt) : null;
      const daysInStage = stageDate ? Math.floor((now - stageDate) / 86400000) : '—';

      // Staleness dot — stage-specific thresholds
      let staleDot = '';
      if (typeof daysInStage === 'number') {
        const staleRules = {
          saved:     { yellow: 5, red: 7 },
          applied:   { yellow: 7, red: 14 },
          responded: { yellow: 7, red: 14 },
          interview: { yellow: 7, red: 14 },
        };
        const rule = staleRules[stage];
        if (rule) {
          if (daysInStage >= rule.red) {
            staleDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--red);" title="' + daysInStage + 'd — needs attention"></span>';
          } else if (daysInStage >= rule.yellow) {
            staleDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;" title="' + daysInStage + 'd in stage"></span>';
          }
        }
      }

      // Filter tag badges
      const filterBadges = (m.filterTags || []).map(tag => {
        const idx = sf.findIndex(f => f.name === tag);
        const color = idx >= 0 ? filterColors[idx % filterColors.length] : 'var(--text-faint)';
        return '<span class="pl-filter-badge" style="background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + tag + '</span>';
      }).join(' ');

      // Match score
      const matchScore = typeof m.matchScore === 'number' ? m.matchScore + '%' : '—';
      const matchColor = typeof m.matchScore === 'number' ? (m.matchScore >= 70 ? 'color:var(--green);' : m.matchScore >= 40 ? 'color:var(--warm);' : 'color:var(--red);') : '';

      // Stage move dropdown
      let moveOpts = PL_STAGES.filter(s => s !== stage).map(s => {
        const labels = {saved:'Saved',applied:'Applied',posting_closed:'Posting Closed',responded:'Responded',interview:'Interview',offer:'Offer',rejected:'Rejected/Ghosted'};
        return '<option value="' + s + '">' + labels[s] + '</option>';
      }).join('');

      html += '<tr data-jobid="' + item.id + '">';
      html += '<td style="width:16px;text-align:center;padding:4px 2px;">' + staleDot + '</td>';
      html += '<td class="pl-title" onclick="openJobModal(\'' + item.id + '\')" title="' + title.replace(/"/g, '&quot;') + '">' + (title.length > 35 ? title.slice(0,35) + '…' : title) + '</td>';
      html += '<td class="pl-company" title="' + company.replace(/"/g, '&quot;') + '">' + (company.length > 20 ? company.slice(0,20) + '…' : company) + '</td>';
      html += '<td>' + (resumeName !== '—' ? '<span class="pl-resume-badge" title="' + resumeName + '">' + resumeName + '</span>' : '<span style="color:var(--text-faint);font-size:11px;">—</span>') + '</td>';
      html += '<td>' + (filterBadges || '<span style="color:var(--text-faint);font-size:10px;">—</span>') + '</td>';
      html += '<td class="pl-date">' + discovered + '</td>';
      html += '<td class="pl-date">' + dayApplied + '</td>';
      html += '<td class="pl-days">' + daysInStage + (typeof daysInStage === 'number' ? 'd' : '') + '</td>';
      html += '<td class="pl-match" style="' + matchColor + '">' + matchScore + '</td>';
      html += '<td><select class="pl-move-select" onchange="movePipelineStage(\'' + item.id + '\', this.value)"><option value="">Move…</option>' + moveOpts + '</select></td>';
      html += '<td><button class="job-action-btn hide-btn" onclick="unsaveFromPipeline(\'' + item.id + '\')" style="padding:2px 6px;font-size:9px;" title="Remove from pipeline">✕</button></td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  }

  // Update stats
  const appliedAndBeyond = stageJobs.applied.length + stageJobs.posting_closed.length + stageJobs.responded.length + stageJobs.interview.length + stageJobs.offer.length + stageJobs.rejected.length;
  $('#p-total').textContent = totalTracked;
  $('#p-active').textContent = activeCount;
  const responseRate = appliedAndBeyond > 0 ? Math.round((respondedCount / appliedAndBeyond) * 100) + '%' : '—';
  $('#p-response').textContent = responseRate;
  const avgDays = respondedCount > 0 ? Math.round(totalDaysToResponse / respondedCount) + 'd' : '—';
  $('#p-avg-days').textContent = avgDays;

  // Update nav dot
  if (typeof updatePipelineNavDot === 'function') updatePipelineNavDot();
}

// Legacy compat: renderPipelineSaved calls renderPipeline
async function renderPipelineSaved() { await renderPipeline(); }

function addToPipeline(jobId, row) {
  const meta = getPipelineMeta();
  if (!meta[jobId]) meta[jobId] = { stage: 'applied', savedAt: new Date().toISOString(), filterTags: [] };
  meta[jobId].stage = 'applied';
  if (!meta[jobId].appliedAt) meta[jobId].appliedAt = new Date().toISOString();
  savePipelineMeta(meta);
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

