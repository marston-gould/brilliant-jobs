// === js/pipeline-overlay-tab.js ===
// Overlay Pipeline S10: Overlay entries tab in Pipeline page
// Reads from _newPipelineCache (pipeline table, keyed by source_url)
// Rendered inside #page-pipeline as a second view alongside legacy user_pipeline entries
// v7.04

(function() {

var _overlayTabInit = false;

// ── Expose toggle function ────────────────────────────────────
window.switchPipelineView = function(view) {
  var legacyEl = document.getElementById('pl-view-legacy');
  var overlayEl = document.getElementById('pl-view-overlay');
  var btnLegacy = document.getElementById('pl-view-btn-legacy');
  var btnOverlay = document.getElementById('pl-view-btn-overlay');
  if (!legacyEl || !overlayEl) return;
  if (view === 'overlay') {
    legacyEl.style.display = 'none';
    overlayEl.style.display = '';
    if (btnLegacy) { btnLegacy.classList.remove('active'); }
    if (btnOverlay) { btnOverlay.classList.add('active'); }
    renderOverlayPipelineTab();
  } else {
    overlayEl.style.display = 'none';
    legacyEl.style.display = '';
    if (btnLegacy) { btnLegacy.classList.add('active'); }
    if (btnOverlay) { btnOverlay.classList.remove('active'); }
  }
};

// ── Main render ───────────────────────────────────────────────
window.renderOverlayPipelineTab = async function() {
  var container = document.getElementById('pl-overlay-stages');
  if (!container) return;

  // Ensure data is loaded
  if (typeof loadNewPipelineFromSupabase === 'function' && !window._newPipelineLoaded) {
    await loadNewPipelineFromSupabase();
  }

  var cache = window._newPipelineCache || {};
  var entries = Object.values(cache);

  if (entries.length === 0) {
    container.innerHTML = '<div class="pl-stage-empty" style="padding:32px 0;text-align:center;color:var(--text-faint);font-size:13px;">No overlay pipeline entries yet.<br><span style="font-size:12px;margin-top:6px;display:block;">Save jobs using the Brilliant Jobs toolbar extension to populate this view.</span></div>';
    _renderOverlayStats([], container);
    return;
  }

  // Sort: most recently updated first
  entries.sort(function(a, b) {
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  // Group by stage
  var PL_OV_STAGES = ['saved','applied','interview','offer','rejected','archived'];
  var PL_OV_LABELS = { saved:'Saved', applied:'Applied', interview:'Interview', offer:'Offer', rejected:'Rejected/Ghosted', archived:'Archived' };
  var stageMap = {};
  PL_OV_STAGES.forEach(function(s) { stageMap[s] = []; });
  entries.forEach(function(e) {
    var s = e.stage || 'saved';
    if (!stageMap[s]) stageMap[s] = [];
    stageMap[s].push(e);
  });

  _renderOverlayStats(entries, container);

  var html = '';
  PL_OV_STAGES.forEach(function(stage) {
    var jobs = stageMap[stage];
    if (jobs.length === 0) return;
    html += '<div class="pl-stage-section" data-stage="' + stage + '">';
    html += '<div class="pl-stage-header" onclick="this.closest(\'.pl-stage-section\').classList.toggle(\'collapsed\')">';
    html += '<svg class="pl-stage-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
    html += '<span class="pl-stage-name">' + (PL_OV_LABELS[stage] || stage) + '</span>';
    html += '<span class="pl-stage-count">' + jobs.length + '</span>';
    html += '</div>';
    html += '<div class="pl-stage-body">';
    html += '<table class="pl-table"><thead><tr>';
    html += '<th>Title</th><th>Company</th><th>Platform</th><th>Source</th><th>Match</th><th>Fraud</th><th>AI</th><th>Saved</th><th>Applied</th><th>Activity</th>';
    html += '</tr></thead><tbody>';
    jobs.forEach(function(e) {
      var title = e.job_title || 'Unknown';
      var company = e.company_name || '';
      var platform = e.source_platform || '—';
      var entrySource = e.entry_source || '—';
      var matchScore = typeof e.match_score === 'number' ? e.match_score + '%' : '—';
      var matchColor = typeof e.match_score === 'number' ? (e.match_score >= 70 ? 'color:var(--green);' : e.match_score >= 40 ? 'color:var(--warm);' : 'color:var(--red);') : '';
      var fraudScore = typeof e.fraud_score === 'number' ? e.fraud_score : null;
      var fraudHtml = fraudScore !== null ? (fraudScore >= 60 ? '<span style="color:var(--red);font-weight:600;">🛡 ' + fraudScore + '</span>' : '<span style="color:var(--text-faint);">' + fraudScore + '</span>') : '<span style="color:var(--text-faint);">—</span>';
      var aiScore = typeof e.ai_content_score === 'number' ? e.ai_content_score : null;
      var aiHtml = aiScore !== null ? (aiScore >= 0.7 ? '<span style="color:var(--warm);font-weight:600;">⚠ ' + Math.round(aiScore * 100) + '%</span>' : '<span style="color:var(--text-faint);">' + Math.round(aiScore * 100) + '%</span>') : '<span style="color:var(--text-faint);">—</span>';
      var savedAt = e.created_at ? new Date(e.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      var appliedAt = e.applied_at ? new Date(e.applied_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';
      var lastActivity = e.updated_at ? _ovRelTime(e.updated_at) : '—';
      var sourceUrl = e.source_url || '';
      var titleLink = sourceUrl ? '<a href="' + sourceUrl + '" target="_blank" rel="noopener" class="pl-title" style="color:var(--accent);text-decoration:none;" title="' + title + '">' + (title.length > 35 ? title.slice(0,35) + '…' : title) + '</a>' : '<span class="pl-title" title="' + title + '">' + (title.length > 35 ? title.slice(0,35) + '…' : title) + '</span>';
      html += '<tr>';
      html += '<td>' + titleLink + '</td>';
      html += '<td class="pl-company" title="' + company + '">' + (company.length > 20 ? company.slice(0,20) + '…' : company) + '</td>';
      html += '<td><span style="font-size:11px;background:var(--accent-dim);color:var(--accent);padding:2px 6px;border-radius:4px;">' + platform + '</span></td>';
      html += '<td style="font-size:11px;color:var(--text-dim);">' + entrySource + '</td>';
      html += '<td class="pl-match" style="' + matchColor + '">' + matchScore + '</td>';
      html += '<td>' + fraudHtml + '</td>';
      html += '<td>' + aiHtml + '</td>';
      html += '<td class="pl-date">' + savedAt + '</td>';
      html += '<td class="pl-date">' + appliedAt + '</td>';
      html += '<td class="pl-date" style="font-size:11px;color:var(--text-dim);">' + lastActivity + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div></div>';
  });

  container.innerHTML = html;
};

// ── Stat cards ────────────────────────────────────────────────
function _renderOverlayStats(entries, container) {
  var statsEl = document.getElementById('pl-overlay-stats');
  if (!statsEl) return;
  var total = entries.length;
  var applied = entries.filter(function(e) { return ['applied','interview','offer'].includes(e.stage); }).length;
  var withScore = entries.filter(function(e) { return typeof e.match_score === 'number'; });
  var avgScore = withScore.length ? Math.round(withScore.reduce(function(a,e) { return a + e.match_score; }, 0) / withScore.length) : null;
  var flagged = entries.filter(function(e) { return e.fraud_score >= 60 || e.ai_content_score >= 0.7; }).length;
  statsEl.innerHTML =
    '<div class="stat-card"><div class="stat-val">' + total + '</div><div class="stat-label">Overlay Entries</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + applied + '</div><div class="stat-label">Applied+</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + (avgScore !== null ? avgScore + '%' : '—') + '</div><div class="stat-label">Avg Match</div></div>' +
    '<div class="stat-card"><div class="stat-val">' + flagged + '</div><div class="stat-label">Flagged Jobs</div></div>';
}

// ── Relative time helper ──────────────────────────────────────
function _ovRelTime(iso) {
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// ── Drill-down from overlay analytics → pipeline overlay tab ─
window.drillDownToOverlayPipeline = function() {
  if (typeof showPage === 'function') showPage('pipeline');
  setTimeout(function() {
    if (typeof switchPipelineView === 'function') switchPipelineView('overlay');
  }, 150);
};

})();

// CS-P1-004 FE-005: Register pipeline-overlay-tab exports with BJ namespace
(function() {
  ['drillDownToOverlayPipeline','renderOverlayPipelineTab','switchPipelineView'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'pipeline-overlay-tab', registered: Date.now() };
    }
  });
})();
