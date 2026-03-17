// @ts-nocheck
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
