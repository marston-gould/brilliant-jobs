// ============================================================
// PIPELINE — Supabase-native stage tracker (Ghost Build Phase 1)
// Replaces localStorage bj_pipeline_meta with user_pipeline table.
// Maintains backward-compatible function signatures for other modules.
// ============================================================
const PL_STAGES = ['saved','applied','posting_closed','responded','interview','offer','hired','rejected','archived'];
const PL_STAGE_COLORS = {
  saved: 'var(--text-dim)', applied: 'var(--accent)', posting_closed: 'var(--warm)',
  responded: 'var(--green)', interview: 'var(--purple)', offer: 'var(--green)',
  hired: 'hsl(142,70%,35%)', rejected: 'var(--red)', archived: 'var(--text-faint)'
};
const PL_STAGE_LABELS = {
  saved:'Saved', applied:'Applied', posting_closed:'Posting Closed',
  responded:'Responded', interview:'Interview', offer:'Offer',
  hired:'Hired!', rejected:'Rejected/Ghosted', archived:'Archived'
};

// In-memory pipeline cache — populated from Supabase, keyed by job_id
let _pipelineCache = {};
let _pipelineLoaded = false;

// ── Supabase-backed getter (replaces getPipelineMeta) ──────────
function getPipelineMeta() {
  // Returns the in-memory cache for synchronous access (backward compat).
  // Cache is populated by loadPipelineFromSupabase() on init.
  return _pipelineCache;
}

// ── Load pipeline from Supabase into memory cache ──────────────
async function loadPipelineFromSupabase() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('user_pipeline')
      .select('*')
      .eq('user_id', currentUser.id);
    if (error) throw error;
    _pipelineCache = {};
    // Also rebuild legacy global arrays for cross-module compat
    savedJobIds.length = 0;
    appliedJobIds.length = 0;
    (data || []).forEach(row => {
      const key = row.job_id || row.id; // job_id preferred, fallback to uuid
      _pipelineCache[key] = {
        _dbId: row.id,              // Supabase row ID for updates
        stage: row.stage,
        savedAt: row.saved_at,
        appliedAt: row.applied_at,
        respondedAt: row.responded_at,
        interviewAt: row.interview_at,
        offerAt: row.offer_at,
        hiredAt: row.hired_at,
        rejectedAt: row.rejected_at,
        archivedAt: row.archived_at,
        resumeUsed: row.resume_used || '',
        filterTags: row.filter_tags || [],
        matchScore: row.match_score,
        companyName: row.company_name || '',
        company: row.company_name || '',
        title: row.job_title || '',
        salaryEstimate: row.salary_estimate,
        notes: row.notes || '',
        autoAdvanced: row.auto_advanced || false,
        autoAdvancedSource: row.auto_advanced_source || null,
        atsSource: row.ats_source || 'greenhouse',
        companySlug: row.company_slug || '',
        companyDomain: row.company_domain || '',
        jobUrl: row.job_url || '',
      };
      // Populate legacy arrays
      if (row.stage !== 'saved') appliedJobIds.push(key);
      savedJobIds.push(key);
    });
    _pipelineLoaded = true;
    console.log('[BJ] Pipeline loaded from Supabase:', data?.length || 0, 'entries');
  } catch (e) {
    console.error('[BJ] Pipeline load error:', e);
    // Fallback: try localStorage if Supabase fails
    _pipelineCache = JSON.parse(localStorage.getItem('bj_pipeline_meta') || '{}');
  }
}

// ── Save single pipeline entry to Supabase (replaces savePipelineMeta) ──
async function savePipelineEntry(jobId, meta) {
  if (!currentUser?.id) return;
  _pipelineCache[jobId] = meta;
  const row = {
    user_id: currentUser.id,
    job_id: jobId,
    ats_source: meta.atsSource || 'greenhouse',
    company_slug: meta.companySlug || meta.company || jobId,
    company_domain: meta.companyDomain || null,
    job_title: meta.title || meta.jobTitle || 'Untitled',
    job_url: meta.jobUrl || null,
    stage: meta.stage || 'saved',
    saved_at: meta.savedAt || new Date().toISOString(),
    applied_at: meta.appliedAt || null,
    responded_at: meta.respondedAt || null,
    interview_at: meta.interviewAt || null,
    offer_at: meta.offerAt || null,
    hired_at: meta.hiredAt || null,
    rejected_at: meta.rejectedAt || null,
    archived_at: meta.archivedAt || null,
    auto_advanced: meta.autoAdvanced || false,
    auto_advanced_source: meta.autoAdvancedSource || null,
    notes: meta.notes || null,
    filter_tags: meta.filterTags || [],
    resume_used: meta.resumeUsed || null,
    match_score: meta.matchScore || null,
    company_name: meta.companyName || meta.company || null,
    salary_estimate: meta.salaryEstimate || null,
  };

  try {
    const { data, error } = await sb.from('user_pipeline')
      .upsert(row, { onConflict: 'user_id, job_id, ats_source' })
      .select('id')
      .single();
    if (error) throw error;
    if (data) meta._dbId = data.id;
  } catch (e) {
    console.error('[BJ] Pipeline save error:', e);
  }
}

// Legacy compat wrapper — saves entire cache (avoid using, prefer savePipelineEntry)
function savePipelineMeta(meta) {
  _pipelineCache = meta;
  // Batch save is async but we don't await here for backward compat
}

// ── One-time localStorage → Supabase migration ────────────────
async function migratePipelineToSupabase() {
  if (!currentUser?.id) return;

  // Check if already migrated — if Supabase has data, skip
  const { data: existing } = await sb.from('user_pipeline')
    .select('id').eq('user_id', currentUser.id).limit(1);
  if (existing?.length) {
    console.log('[BJ] Pipeline already in Supabase, skipping migration');
    return false;
  }

  // Read localStorage data
  const localMeta = JSON.parse(localStorage.getItem('bj_pipeline_meta') || '{}');
  const localApplied = JSON.parse(localStorage.getItem('bj_applied_jobs') || '[]');
  const localSaved = JSON.parse(localStorage.getItem('bj_saved_jobs') || '[]');
  const localDates = JSON.parse(localStorage.getItem('bj_applied_dates') || '{}');

  const allIds = new Set([...Object.keys(localMeta), ...localApplied, ...localSaved]);
  if (allIds.size === 0) {
    console.log('[BJ] No localStorage pipeline data to migrate');
    return false;
  }

  console.log('[BJ] Migrating', allIds.size, 'pipeline entries to Supabase...');

  // Fetch job data for company info
  const idList = Array.from(allIds);
  let jobMap = {};
  for (let i = 0; i < idList.length; i += 100) {
    const batch = idList.slice(i, i + 100);
    try {
      const { data } = await sb.from('ats_jobs')
        .select('greenhouse_id, title, company_name, ats_source, status')
        .in('greenhouse_id', batch);
      if (data) data.forEach(j => { jobMap[j.greenhouse_id] = j; });
    } catch (e) { console.error('[BJ] Migration fetch error:', e); }
  }

  // Build rows
  const rows = [];
  for (const jobId of allIds) {
    const m = localMeta[jobId] || {};
    const job = jobMap[jobId];
    const isApplied = localApplied.includes(jobId);
    rows.push({
      user_id: currentUser.id,
      job_id: jobId,
      ats_source: job?.ats_source || 'greenhouse',
      company_slug: m.companySlug || job?.company_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || jobId,
      job_title: m.title || job?.title || 'Unknown',
      company_name: m.company || m.companyName || job?.company_name || null,
      stage: m.stage || (isApplied ? 'applied' : 'saved'),
      saved_at: m.savedAt || localDates[jobId] || new Date().toISOString(),
      applied_at: m.appliedAt || (isApplied ? (localDates[jobId] || new Date().toISOString()) : null),
      responded_at: m.respondedAt || null,
      interview_at: m.interviewAt || null,
      offer_at: m.offerAt || null,
      hired_at: m.hiredAt || null,
      rejected_at: m.rejectedAt || null,
      filter_tags: m.filterTags || [],
      resume_used: m.resumeUsed || null,
      match_score: typeof m.matchScore === 'number' ? m.matchScore : null,
      salary_estimate: m.salaryEstimate || null,
    });
  }

  // Batch upsert
  const { error } = await sb.from('user_pipeline')
    .upsert(rows, { onConflict: 'user_id, job_id, ats_source' });

  if (error) {
    console.error('[BJ] Pipeline migration error:', error);
    return false;
  }

  // Clean up localStorage
  localStorage.removeItem('bj_pipeline_meta');
  localStorage.removeItem('bj_applied_jobs');
  localStorage.removeItem('bj_saved_jobs');
  localStorage.removeItem('bj_applied_dates');
  console.log('[BJ] ✅ Migrated', rows.length, 'pipeline entries to Supabase');
  return true;
}

// ── Initialize pipeline (call from app.js init) ──────────────
async function initPipeline() {
  await migratePipelineToSupabase();
  await loadPipelineFromSupabase();
}

// ── Move job to a new stage ──────────────────────────────────
function movePipelineStage(jobId, newStage) {
  const meta = _pipelineCache[jobId];
  if (!meta) {
    _pipelineCache[jobId] = { savedAt: new Date().toISOString(), filterTags: [], stage: newStage };
  } else {
    meta.stage = newStage;
  }
  const m = _pipelineCache[jobId];

  // Track stage dates
  const now = new Date().toISOString();
  if (newStage === 'applied' && !m.appliedAt) m.appliedAt = now;
  if (newStage === 'responded' && !m.respondedAt) m.respondedAt = now;
  if (newStage === 'interview' && !m.interviewAt) m.interviewAt = now;
  if (newStage === 'offer' && !m.offerAt) m.offerAt = now;
  if (newStage === 'hired' && !m.hiredAt) {
    m.hiredAt = now;
    if (typeof confirmHireFee === 'function') {
      var jobTitle = m.title || jobId;
      var salary = m.salaryEstimate || 80000;
      confirmHireFee(jobId, jobTitle, salary);
    }
  }
  if (newStage === 'rejected' && !m.rejectedAt) m.rejectedAt = now;
  if (newStage === 'archived' && !m.archivedAt) m.archivedAt = now;

  // Save to Supabase (async, non-blocking for UI)
  savePipelineEntry(jobId, m);

  // Keep legacy arrays in sync
  if (newStage !== 'saved' && !appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
  }
  renderPipeline();
}

// ── Mark applied from feed ───────────────────────────────────
function markApplied(jobId, btn) {
  showResumePicker(jobId, function(resumeName) {
    _completeMarkApplied(jobId, btn, resumeName);
  });
}

function _completeMarkApplied(jobId, btn, resumeName) {
  if (!appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
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

  // Update pipeline
  const meta = _pipelineCache[jobId] || { savedAt: new Date().toISOString(), filterTags: [] };
  meta.stage = 'applied';
  if (!meta.appliedAt) meta.appliedAt = new Date().toISOString();
  if (resumeName) meta.resumeUsed = resumeName;

  // Detect filter tags
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  meta.filterTags = checkedFilters;

  _pipelineCache[jobId] = meta;
  savePipelineEntry(jobId, meta);

  // Post-application confidence micro-survey
  if (typeof showApplyConfidence === 'function') {
    showApplyConfidence(jobId, meta.companyName || '');
  }
}

function markAppliedFromPipeline(jobId, btn) {
  markApplied(jobId, btn);
  renderPipeline();
}

// ── Remove from pipeline ─────────────────────────────────────
async function unsaveFromPipeline(jobId) {
  const meta = _pipelineCache[jobId];
  delete _pipelineCache[jobId];

  // Remove from Supabase
  if (currentUser?.id) {
    try {
      await sb.from('user_pipeline')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('job_id', jobId);
    } catch (e) { console.error('[BJ] Pipeline delete error:', e); }
  }

  // Update legacy arrays
  const idx = savedJobIds.indexOf(jobId);
  if (idx >= 0) savedJobIds.splice(idx, 1);
  const aidx = appliedJobIds.indexOf(jobId);
  if (aidx >= 0) appliedJobIds.splice(aidx, 1);
  const el = $('#j-saved');
  if (el) el.textContent = savedJobIds.length.toLocaleString();
  renderPipeline();
}

// ── Collapse toggle ──────────────────────────────────────────
function togglePipelineStage(headerEl) {
  const section = headerEl.closest('.pl-stage-section');
  section.classList.toggle('collapsed');
  const states = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');
  states[section.dataset.stage] = section.classList.contains('collapsed');
  localStorage.setItem('bj_pl_collapse', JSON.stringify(states));
}

// ── Filter by saved filter tag ───────────────────────────────
let _plActiveFilter = 'all';
function filterPipeline(tag) {
  _plActiveFilter = tag;
  renderPipeline();
}

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

// ── Main render ──────────────────────────────────────────────
async function renderPipeline() {
  const meta = _pipelineCache;
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

  // Fetch all pipeline jobs from Supabase (for supplementary data like status)
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
      savePipelineEntry(j.greenhouse_id, meta[j.greenhouse_id]);
    }
  });

  const now = new Date();
  const sf = JSON.parse(localStorage.getItem('bj_saved_filters') || '[]');
  const collapseStates = JSON.parse(localStorage.getItem('bj_pl_collapse') || '{}');

  // Group by stage
  const stageJobs = {};
  PL_STAGES.forEach(s => { stageJobs[s] = []; });
  let totalTracked = 0, activeCount = 0, respondedCount = 0, totalDaysToResponse = 0;

  for (const [jobId, m] of Object.entries(meta)) {
    const stage = m.stage || 'saved';
    if (!stageJobs[stage]) continue;
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
    if (section && collapseStates[stage]) section.classList.add('collapsed');

    const scores = jobs.map(j => j.meta.matchScore).filter(s => typeof s === 'number');
    if (matchEl) {
      if (scores.length > 0) {
        const median = scores.sort((a,b) => a - b)[Math.floor(scores.length / 2)];
        matchEl.textContent = 'Match: ' + Math.min(...scores) + '% – ' + median + '% – ' + Math.max(...scores) + '%';
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
      const title = m.title || (j ? (j.title || 'Untitled') : 'Unknown job');
      const company = m.companyName || m.company || (j ? (j.company_name || '') : '');
      // Persist job info in meta for hire fee and analytics
      if (j && !m.title) { m.title = title; m.company = company; }
      if (j && j.salary_max && !m.salaryEstimate) { m.salaryEstimate = j.salary_max; }
      const discovered = j?.first_seen_at ? new Date(j.first_seen_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const appliedDate = m.appliedAt ? new Date(m.appliedAt) : null;
      const dayApplied = appliedDate ? appliedDate.toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      const resumeName = m.resumeUsed || '—';

      const stageDate = m.respondedAt ? new Date(m.respondedAt) :
                        m.appliedAt ? new Date(m.appliedAt) :
                        m.savedAt ? new Date(m.savedAt) : null;
      const daysInStage = stageDate ? Math.floor((now - stageDate) / 86400000) : '—';

      let staleDot = '';
      if (typeof daysInStage === 'number') {
        const staleRules = {
          saved:     { yellow: 5, red: 7 },
          applied:   { yellow: 7, red: 14 },
          posting_closed: { yellow: 3, red: 7 },
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

      const filterBadges = (m.filterTags || []).map(tag => {
        const idx = sf.findIndex(f => f.name === tag);
        const color = idx >= 0 ? filterColors[idx % filterColors.length] : 'var(--text-faint)';
        return '<span class="pl-filter-badge" style="background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + tag + '</span>';
      }).join(' ');

      const matchScore = typeof m.matchScore === 'number' ? m.matchScore + '%' : '—';
      const matchColor = typeof m.matchScore === 'number' ? (m.matchScore >= 70 ? 'color:var(--green);' : m.matchScore >= 40 ? 'color:var(--warm);' : 'color:var(--red);') : '';

      let moveOpts = PL_STAGES.filter(s => s !== stage).map(s =>
        '<option value="' + s + '">' + PL_STAGE_LABELS[s] + '</option>'
      ).join('');

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
  const el1 = $('#p-total'); if (el1) el1.textContent = totalTracked;
  const el2 = $('#p-active'); if (el2) el2.textContent = activeCount;
  const responseRate = appliedAndBeyond > 0 ? Math.round((respondedCount / appliedAndBeyond) * 100) + '%' : '—';
  const el3 = $('#p-response'); if (el3) el3.textContent = responseRate;
  const avgDays = respondedCount > 0 ? Math.round(totalDaysToResponse / respondedCount) + 'd' : '—';
  const el4 = $('#p-avg-days'); if (el4) el4.textContent = avgDays;

  if (typeof updatePipelineNavDot === 'function') updatePipelineNavDot();
}

// Legacy compat
async function renderPipelineSaved() { await renderPipeline(); }

function addToPipeline(jobId, row) {
  const meta = _pipelineCache[jobId] || { stage: 'applied', savedAt: new Date().toISOString(), filterTags: [] };
  meta.stage = 'applied';
  if (!meta.appliedAt) meta.appliedAt = new Date().toISOString();
  _pipelineCache[jobId] = meta;
  savePipelineEntry(jobId, meta);
}

// ── Migrated pipeline data init (replaces old migratePipelineData) ──
function migratePipelineData() {
  // No-op — migration now handled by migratePipelineToSupabase() in initPipeline()
  console.log('[BJ] Pipeline migration handled by initPipeline()');
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

// ── Ghost Monitor rendering ──────────────────────────────────
async function renderGhostMonitor() {
  if (!currentUser?.id) return;
  const tbody = document.getElementById('ghost-table-body');
  if (!tbody) return;

  try {
    const { data, error } = await sb.rpc('get_pipeline_ghost_status', { p_user_id: currentUser.id });
    if (error) throw error;

    // Update KPI cards
    const activeEl = document.getElementById('g-active');
    const avgWaitEl = document.getElementById('g-avg-wait');
    const likelyEl = document.getElementById('g-likely');
    const ghostedEl = document.getElementById('g-ghosted');

    const entries = data || [];
    if (activeEl) activeEl.textContent = entries.length;

    const totalDays = entries.reduce((sum, e) => sum + (e.days_since_applied || 0), 0);
    if (avgWaitEl) avgWaitEl.textContent = entries.length > 0 ? Math.round(totalDays / entries.length) + 'd' : '—';

    const likelyCount = entries.filter(e => e.ghost_status === 'likely_ghosted').length;
    const ghostedCount = entries.filter(e => e.ghost_status === 'ghosted').length;
    if (likelyEl) likelyEl.textContent = likelyCount;
    if (ghostedEl) ghostedEl.textContent = ghostedCount;

    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-faint);padding:32px;">No active applications to monitor. Apply to jobs from the Feed to see ghost detection here.</td></tr>';
      return;
    }

    // Sort: ghosted first, then by score desc
    entries.sort((a, b) => (b.ghost_score || 0) - (a.ghost_score || 0));

    let html = '';
    for (const e of entries) {
      const score = e.ghost_score || 0;
      const status = e.ghost_status || 'active';
      const statusColors = {
        active: 'color:var(--green);', waiting: 'color:#f59e0b;',
        likely_ghosted: 'color:var(--red);', ghosted: 'color:var(--red);font-weight:600;'
      };
      const statusLabels = {
        active: 'Active', waiting: 'Waiting',
        likely_ghosted: 'Likely Ghosted', ghosted: 'Ghosted'
      };
      const listingLabels = {
        open: '<span style="color:var(--green);">Open</span>',
        closed: '<span style="color:var(--red);">Closed</span>',
        removed: '<span style="color:var(--red);">Removed</span>',
        unknown: '<span style="color:var(--text-faint);">—</span>'
      };

      // Score bar color
      const barColor = score >= 80 ? 'var(--red)' : score >= 50 ? '#f59e0b' : score >= 25 ? 'var(--accent)' : 'var(--green)';

      const appliedStr = e.applied_at ? new Date(e.applied_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';

      const actionBtn = status === 'ghosted'
        ? '<button class="btn btn-outline btn-sm" style="font-size:10px;padding:2px 8px;" onclick="movePipelineStage(\'' + e.pipeline_entry_id + '\', \'archived\')">Archive</button>'
        : status === 'likely_ghosted'
        ? '<span style="font-size:11px;color:var(--text-dim);">Follow up</span>'
        : '<span style="font-size:11px;color:var(--text-faint);">—</span>';

      html += '<tr>';
      html += '<td title="' + (e.company_slug || '') + '">' + (e.company_name || e.company_slug || '—') + '</td>';
      html += '<td title="' + (e.job_title || '') + '">' + ((e.job_title || '').length > 30 ? (e.job_title || '').slice(0,30) + '…' : (e.job_title || '—')) + '</td>';
      html += '<td>' + appliedStr + '</td>';
      html += '<td>' + (e.days_since_applied || 0) + 'd</td>';
      html += '<td>' + (listingLabels[e.listing_status] || listingLabels.unknown) + '</td>';
      html += '<td><div style="display:flex;align-items:center;gap:6px;">';
      html += '<div style="width:40px;height:6px;background:var(--bg-card);border-radius:3px;overflow:hidden;">';
      html += '<div style="width:' + score + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div></div>';
      html += '<span style="font-size:11px;font-weight:500;">' + score + '</span></div></td>';
      html += '<td style="' + (statusColors[status] || '') + 'font-size:12px;">' + (statusLabels[status] || status) + '</td>';
      html += '<td>' + actionBtn + '</td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;

  } catch (err) {
    console.error('[BJ] Ghost monitor error:', err);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--red);padding:32px;">Error loading ghost data: ' + (err.message || 'unknown') + '</td></tr>';
  }
}

// Auto-load ghost monitor when page is shown
function onGhostPageShow() {
  renderGhostMonitor();
}

// ── Gmail connection UI ──────────────────────────────────────
async function connectGmail() {
  const btn = document.getElementById('gmail-connect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting...'; }

  try {
    const session = await sb.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) { window.location.href = '/'; return; }

    const res = await fetch(SUPABASE_FUNCTIONS_URL + '/gmail-auth?action=connect', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Connect Gmail'; }
      console.error('[BJ] Gmail connect error:', data);
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Connect Gmail'; }
    console.error('[BJ] Gmail connect error:', e);
  }
}

async function disconnectGmail() {
  if (!confirm('Disconnect Gmail? This will remove all email signal data.')) return;

  const btn = document.getElementById('gmail-disconnect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Disconnecting...'; }

  try {
    const session = await sb.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;

    await fetch(SUPABASE_FUNCTIONS_URL + '/gmail-disconnect', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    });

    // Refresh UI
    updateGmailStatus();
    renderGhostMonitor();
  } catch (e) {
    console.error('[BJ] Gmail disconnect error:', e);
  }
}

async function updateGmailStatus() {
  if (!currentUser?.id) return;

  const gmailCard = document.getElementById('g-gmail-card');
  const connectBtn = document.getElementById('gmail-connect-btn');

  const { data: conn } = await sb.from('gmail_connections')
    .select('gmail_address, sync_status, last_sync_at, error_message')
    .eq('user_id', currentUser.id)
    .single();

  if (conn && conn.sync_status === 'active') {
    // Connected state
    if (gmailCard) {
      gmailCard.querySelector('.stat-val').innerHTML =
        '<span style="color:var(--green);font-size:14px;">Connected</span>';
      gmailCard.querySelector('.stat-label').textContent = conn.gmail_address || 'Gmail';
    }
    if (connectBtn) {
      connectBtn.textContent = 'Disconnect Gmail';
      connectBtn.className = 'btn btn-outline btn-sm';
      connectBtn.disabled = false;
      connectBtn.onclick = disconnectGmail;
      connectBtn.id = 'gmail-disconnect-btn';
    }
  } else if (conn && conn.sync_status === 'error') {
    if (gmailCard) {
      gmailCard.querySelector('.stat-val').innerHTML =
        '<span style="color:var(--red);font-size:14px;">Error</span>';
      gmailCard.querySelector('.stat-label').textContent = conn.error_message || 'Reconnect needed';
    }
    if (connectBtn) {
      connectBtn.textContent = 'Reconnect Gmail';
      connectBtn.className = 'btn btn-primary btn-sm';
      connectBtn.disabled = false;
      connectBtn.onclick = connectGmail;
    }
  } else {
    // Not connected
    if (gmailCard) {
      gmailCard.querySelector('.stat-val').innerHTML =
        '<span style="font-size:14px;color:var(--text-dim);">Not Connected</span>';
      gmailCard.querySelector('.stat-label').textContent = 'Gmail Status';
    }
    if (connectBtn) {
      connectBtn.textContent = 'Connect Gmail';
      connectBtn.className = 'btn btn-primary btn-sm';
      connectBtn.disabled = false;
      connectBtn.onclick = connectGmail;
    }
  }

  // Check URL params for gmail connect result
  const params = new URLSearchParams(window.location.search);
  const gmailResult = params.get('gmail');
  if (gmailResult) {
    const msgs = {
      connected: 'Gmail connected! Email scanning will begin shortly.',
      denied: 'Gmail connection was denied.',
      error: 'Gmail connection failed. Please try again.',
    };
    if (msgs[gmailResult]) {
      // Show toast notification
      const toast = document.createElement('div');
      toast.className = 'toast-notification';
      toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;z-index:9999;font-size:13px;animation:fadeIn 0.3s;';
      toast.style.background = gmailResult === 'connected' ? 'var(--green)' : 'var(--red)';
      toast.style.color = '#fff';
      toast.textContent = msgs[gmailResult];
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }
}
