// @ts-nocheck
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
