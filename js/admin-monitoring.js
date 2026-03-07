/* ───────────────────────────────────────────────────────────
   admin-monitoring.js — Platform Monitoring Dashboard (AD-FIX-11)
   CS-023: Aggregated health view — cron health, feed status,
   surface latency, error aggregation, health-check EF integration
   ─────────────────────────────────────────────────────────── */

var _monitorRefreshTimer = null;
var _monitorData = {};

var HEALTH_CHECK_URL = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/health-check';
var PROD_SURFACES = [
  { name: 'Landing Page', url: 'https://brilliantjobs.app/' },
  { name: 'Dashboard', url: 'https://brilliantjobs.app/dashboard.html' },
  { name: 'Admin', url: 'https://brilliantjobs.app/admin.html' },
  { name: 'Roadmap', url: 'https://brilliantjobs.app/roadmap' }
];

async function loadMonitoringPanel() {
  var el = document.getElementById('admin-page-monitoring');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Platform Health Monitor</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="mon-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="mon-refresh-btn">↻ Refresh All</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Overall Status Banner -->',
    '  <div id="mon-status-banner" style="padding:16px;border-radius:8px;margin-bottom:20px;background:var(--bg-input);border:1px solid var(--border);text-align:center;">',
    '    <div style="font-size:13px;color:var(--muted);">Loading platform health…</div>',
    '  </div>',
    '',
    '  <!-- Summary Cards Row -->',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;" id="mon-summary-cards">',
    '  </div>',
    '',
    '  <!-- Health Check EF Results -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Health Check Endpoint</div>',
    '    <div id="mon-health-ef" style="font-size:13px;color:var(--muted);">Checking…</div>',
    '  </div>',
    '',
    '  <!-- Surface Latency -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Surface Latency</div>',
    '    <table class="admin-table" style="width:100%;"><thead><tr><th>Surface</th><th>Status</th><th style="text-align:right;">Latency</th><th>Detail</th></tr></thead>',
    '    <tbody id="mon-latency-body"><tr><td colspan="4" style="text-align:center;color:var(--muted);font-size:13px;padding:12px;">Probing surfaces…</td></tr></tbody></table>',
    '  </div>',
    '',
    '  <!-- Cron Health Summary -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Cron Jobs Summary</div>',
    '      <button class="admin-btn admin-btn-sm" onclick="navigateAdminSubpage(\'cron\')">View Full Cron Panel →</button>',
    '    </div>',
    '    <div id="mon-cron-summary" style="font-size:13px;color:var(--muted);">Loading…</div>',
    '  </div>',
    '',
    '  <!-- Feed Freshness -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Feed &amp; Data Freshness</div>',
    '      <button class="admin-btn admin-btn-sm" onclick="navigateAdminSubpage(\'feed-health\')">View Feed Health →</button>',
    '    </div>',
    '    <div id="mon-feed-summary" style="font-size:13px;color:var(--muted);">Loading…</div>',
    '  </div>',
    '',
    '  <!-- Recent Alerts -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">',
    '      <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;">Recent Alerts (24h)</div>',
    '      <button class="admin-btn admin-btn-sm" onclick="navigateAdminSubpage(\'alerts\')">Manage Alerts →</button>',
    '    </div>',
    '    <div id="mon-recent-alerts" style="font-size:13px;color:var(--muted);">Loading…</div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Bind refresh
  document.getElementById('mon-refresh-btn').addEventListener('click', function() {
    _refreshMonitoring();
  });

  // Initial load
  await _refreshMonitoring();

  // Auto-refresh every 90s
  if (_monitorRefreshTimer) clearInterval(_monitorRefreshTimer);
  _monitorRefreshTimer = setInterval(_refreshMonitoring, 90000);
}

async function _refreshMonitoring() {
  var lastEl = document.getElementById('mon-last-refresh');
  if (lastEl) lastEl.textContent = 'Refreshing…';

  try {
    // Run all checks in parallel
    await Promise.allSettled([
      _loadHealthCheckEF(),
      _loadSurfaceLatency(),
      _loadCronSummary(),
      _loadFeedSummary(),
      _loadRecentAlerts(),
      _loadMonitoringSummary()
    ]);
  } catch (e) {
    console.error('[Monitoring] Refresh error:', e);
    if (typeof reportError === 'function') reportError('admin-monitoring', e);
  }

  if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ─── Health Check EF ───
async function _loadHealthCheckEF() {
  var container = document.getElementById('mon-health-ef');
  if (!container) return;

  try {
    var start = performance.now();
    var res = await fetch(HEALTH_CHECK_URL);
    var latency = Math.round(performance.now() - start);
    var body = await res.json();

    _monitorData.healthEF = body;

    var statusColor = body.status === 'healthy' ? '#22c55e' : body.status === 'degraded' ? '#f59e0b' : '#ef4444';
    var statusIcon = body.status === 'healthy' ? '🟢' : body.status === 'degraded' ? '🟡' : '🔴';

    var checksHtml = '';
    if (body.checks) {
      Object.keys(body.checks).forEach(function(key) {
        var c = body.checks[key];
        var dot = c.status === 'pass' ? '✅' : '❌';
        checksHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);">' +
          '<span>' + dot + ' ' + _monEscHtml(key) + '</span>' +
          '<span style="color:var(--muted);font-size:12px;">' + (c.latencyMs || 0) + 'ms — ' + _monEscHtml(c.message || '') + '</span>' +
          '</div>';
      });
    }

    container.innerHTML = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">' +
      '<span style="font-size:20px;">' + statusIcon + '</span>' +
      '<div><strong style="color:' + statusColor + ';">' + body.status.toUpperCase() + '</strong>' +
      '<span style="color:var(--muted);font-size:12px;margin-left:8px;">v' + (body.version || '?') + ' · ' + latency + 'ms · ' + (body.timestamp || '') + '</span></div>' +
      '</div>' + checksHtml;

    // Update banner
    _updateStatusBanner(body.status);

  } catch (e) {
    container.innerHTML = '<div style="color:var(--danger,#ef4444);">⚠ Health check failed: ' + _monEscHtml(e.message) + '</div>';
    _updateStatusBanner('error');
  }
}

function _updateStatusBanner(status) {
  var banner = document.getElementById('mon-status-banner');
  if (!banner) return;

  var configs = {
    'healthy': { bg: '#05200d', border: '#22c55e', icon: '🟢', text: 'All Systems Operational', color: '#22c55e' },
    'degraded': { bg: '#1a1400', border: '#f59e0b', icon: '🟡', text: 'Degraded Performance', color: '#f59e0b' },
    'unhealthy': { bg: '#200505', border: '#ef4444', icon: '🔴', text: 'System Issues Detected', color: '#ef4444' },
    'error': { bg: '#200505', border: '#ef4444', icon: '❌', text: 'Health Check Unreachable', color: '#ef4444' }
  };

  var cfg = configs[status] || configs['error'];
  banner.style.background = cfg.bg;
  banner.style.borderColor = cfg.border;
  banner.innerHTML = '<div style="font-size:24px;margin-bottom:4px;">' + cfg.icon + '</div>' +
    '<div style="font-size:16px;font-weight:600;color:' + cfg.color + ';">' + cfg.text + '</div>' +
    '<div style="font-size:12px;color:var(--muted);margin-top:4px;">' + new Date().toLocaleString() + '</div>';
}

// ─── Surface Latency ───
async function _loadSurfaceLatency() {
  var tbody = document.getElementById('mon-latency-body');
  if (!tbody) return;

  var rows = [];
  for (var i = 0; i < PROD_SURFACES.length; i++) {
    var s = PROD_SURFACES[i];
    try {
      var start = performance.now();
      var res = await fetch(s.url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      var latency = Math.round(performance.now() - start);
      var statusText = '✅ Reachable';
      var latencyClass = latency < 1000 ? 'color:#22c55e;' : latency < 3000 ? 'color:#f59e0b;' : 'color:#ef4444;';
      rows.push('<tr><td>' + _monEscHtml(s.name) + '</td><td>' + statusText + '</td>' +
        '<td style="text-align:right;font-weight:600;' + latencyClass + '">' + latency + 'ms</td>' +
        '<td style="font-size:12px;color:var(--muted);">' + _monEscHtml(s.url) + '</td></tr>');
    } catch (e) {
      rows.push('<tr><td>' + _monEscHtml(s.name) + '</td><td style="color:#ef4444;">❌ Unreachable</td>' +
        '<td style="text-align:right;">—</td>' +
        '<td style="font-size:12px;color:var(--muted);">' + _monEscHtml(e.message) + '</td></tr>');
    }
  }

  tbody.innerHTML = rows.join('');
}

// ─── Cron Summary ───
async function _loadCronSummary() {
  var container = document.getElementById('mon-cron-summary');
  if (!container) return;

  try {
    var res = await sb.from('v_cron_health').select('*');
    if (res.error) throw new Error(res.error.message);

    var data = res.data || [];
    var counts = { green: 0, amber: 0, red: 0, disabled: 0, unknown: 0 };
    data.forEach(function(j) { counts[j.health] = (counts[j.health] || 0) + 1; });

    var total = data.length;
    var failedJobs = data.filter(function(j) { return j.health === 'red'; });

    var summaryHtml = '<div style="display:flex;gap:16px;align-items:center;margin-bottom:8px;">' +
      '<span style="color:#22c55e;font-weight:600;">' + counts.green + ' healthy</span>' +
      '<span style="color:#f59e0b;font-weight:600;">' + counts.amber + ' stale</span>' +
      '<span style="color:#ef4444;font-weight:600;">' + counts.red + ' failed</span>' +
      '<span style="color:#6b7280;">' + counts.disabled + ' disabled</span>' +
      '<span style="color:var(--muted);">' + total + ' total</span>' +
      '</div>';

    if (failedJobs.length > 0) {
      summaryHtml += '<div style="margin-top:8px;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;font-size:12px;">';
      summaryHtml += '<strong style="color:#ef4444;">Failed jobs:</strong> ';
      summaryHtml += failedJobs.map(function(j) {
        return _monEscHtml(j.jobname) + ' (' + _monTimeAgo(new Date(j.last_start)) + ')';
      }).join(', ');
      summaryHtml += '</div>';
    }

    container.innerHTML = summaryHtml;
    _monitorData.cron = { counts: counts, total: total, failedJobs: failedJobs };

  } catch (e) {
    container.innerHTML = '<span style="color:#ef4444;">Error loading cron data: ' + _monEscHtml(e.message) + '</span>';
  }
}

// ─── Feed Summary ───
async function _loadFeedSummary() {
  var container = document.getElementById('mon-feed-summary');
  if (!container) return;

  try {
    // Get freshest job data
    var jobRes = await sb.from('ats_jobs')
      .select('last_seen')
      .order('last_seen', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get open job count
    var countRes = await sb.from('ats_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'open');

    var freshness = '—';
    var freshnessColor = 'var(--muted)';
    if (jobRes.data && jobRes.data.last_seen) {
      var minutesAgo = Math.round((Date.now() - new Date(jobRes.data.last_seen).getTime()) / 60000);
      freshness = minutesAgo + ' min ago';
      freshnessColor = minutesAgo < 30 ? '#22c55e' : minutesAgo < 120 ? '#f59e0b' : '#ef4444';
    }

    var openJobs = countRes.count || 0;

    container.innerHTML = '<div style="display:flex;gap:24px;align-items:center;">' +
      '<div><span style="font-size:12px;color:var(--muted);display:block;">Last Data Update</span>' +
      '<span style="font-weight:600;color:' + freshnessColor + ';">' + freshness + '</span></div>' +
      '<div><span style="font-size:12px;color:var(--muted);display:block;">Open Jobs</span>' +
      '<span style="font-weight:600;">' + openJobs.toLocaleString() + '</span></div>' +
      '</div>';

    _monitorData.feed = { freshness: freshness, minutesAgo: minutesAgo, openJobs: openJobs };

  } catch (e) {
    container.innerHTML = '<span style="color:#ef4444;">Error: ' + _monEscHtml(e.message) + '</span>';
  }
}

// ─── Recent Alerts ───
async function _loadRecentAlerts() {
  var container = document.getElementById('mon-recent-alerts');
  if (!container) return;

  try {
    var oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    var res = await sb.from('alert_history')
      .select('*')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    if (res.error) {
      // Table may not exist yet — show empty state
      if (res.error.code === '42P01' || res.error.message.indexOf('does not exist') !== -1) {
        container.innerHTML = '<div style="color:var(--muted);font-size:13px;">Alert history table not yet created. Run the CS-023 migration to enable alerts.</div>';
        return;
      }
      throw new Error(res.error.message);
    }

    var alerts = res.data || [];

    if (alerts.length === 0) {
      container.innerHTML = '<div style="color:#22c55e;font-size:13px;">✅ No alerts in the last 24 hours. All clear.</div>';
      return;
    }

    var html = '<table class="admin-table" style="width:100%;"><thead><tr><th>Time</th><th>Severity</th><th>Alert</th><th>Status</th></tr></thead><tbody>';
    alerts.forEach(function(a) {
      var sevDot = a.severity === 'critical' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';
      var statusBadge = a.status === 'fired' ? '<span style="color:#ef4444;font-weight:600;">Active</span>' :
        a.status === 'acknowledged' ? '<span style="color:#f59e0b;">Ack\'d</span>' :
        '<span style="color:#22c55e;">Resolved</span>';
      html += '<tr>' +
        '<td style="white-space:nowrap;font-size:12px;">' + _monTimeAgo(new Date(a.created_at)) + '</td>' +
        '<td>' + sevDot + ' ' + a.severity + '</td>' +
        '<td>' + _monEscHtml(a.message) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';

    container.innerHTML = html;

  } catch (e) {
    container.innerHTML = '<span style="color:var(--muted);font-size:13px;">Alerts unavailable: ' + _monEscHtml(e.message) + '</span>';
  }
}

// ─── Monitoring Summary (from view) ───
async function _loadMonitoringSummary() {
  var cardsEl = document.getElementById('mon-summary-cards');
  if (!cardsEl) return;

  try {
    var res = await sb.from('v_monitoring_summary').select('*').maybeSingle();

    if (res.error) {
      // View may not exist yet — use fallback data
      if (res.error.code === '42P01' || res.error.message.indexOf('does not exist') !== -1) {
        _renderSummaryCardsFallback(cardsEl);
        return;
      }
      throw new Error(res.error.message);
    }

    var d = res.data || {};

    var cards = [
      { label: 'Checks (24h)', value: d.checks_24h || 0, color: 'var(--text)' },
      { label: 'Unhealthy', value: d.unhealthy_24h || 0, color: (d.unhealthy_24h || 0) > 0 ? '#ef4444' : '#22c55e' },
      { label: 'Degraded', value: d.degraded_24h || 0, color: (d.degraded_24h || 0) > 0 ? '#f59e0b' : '#22c55e' },
      { label: 'Alerts (24h)', value: d.alerts_24h || 0, color: (d.alerts_24h || 0) > 0 ? '#f59e0b' : 'var(--text)' },
      { label: 'Unresolved', value: d.unresolved_24h || 0, color: (d.unresolved_24h || 0) > 0 ? '#ef4444' : '#22c55e' }
    ];

    _renderSummaryCards(cardsEl, cards);

  } catch (e) {
    _renderSummaryCardsFallback(cardsEl);
  }
}

function _renderSummaryCards(el, cards) {
  el.innerHTML = cards.map(function(c) {
    return '<div class="stat-card">' +
      '<div class="stat-val" style="color:' + c.color + ';">' + c.value + '</div>' +
      '<div class="stat-label">' + c.label + '</div></div>';
  }).join('');
}

function _renderSummaryCardsFallback(el) {
  var cards = [
    { label: 'Health EF', value: _monitorData.healthEF ? (_monitorData.healthEF.status || '—').toUpperCase() : '—', color: 'var(--text)' },
    { label: 'Cron Failed', value: _monitorData.cron ? _monitorData.cron.counts.red : '—', color: (_monitorData.cron && _monitorData.cron.counts.red > 0) ? '#ef4444' : '#22c55e' },
    { label: 'Cron Stale', value: _monitorData.cron ? _monitorData.cron.counts.amber : '—', color: (_monitorData.cron && _monitorData.cron.counts.amber > 0) ? '#f59e0b' : '#22c55e' },
    { label: 'Open Jobs', value: _monitorData.feed ? _monitorData.feed.openJobs.toLocaleString() : '—', color: 'var(--text)' },
    { label: 'Data Age', value: _monitorData.feed ? _monitorData.feed.freshness : '—', color: (_monitorData.feed && _monitorData.feed.minutesAgo > 120) ? '#ef4444' : '#22c55e' }
  ];
  _renderSummaryCards(el, cards);
}

// ─── Utilities ───
function _monTimeAgo(date) {
  var secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return secs + 's ago';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h ago';
}

function _monEscHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Cleanup on tab switch
function _cleanupMonitoringPanel() {
  if (_monitorRefreshTimer) {
    clearInterval(_monitorRefreshTimer);
    _monitorRefreshTimer = null;
  }
}

// Export
window.loadMonitoringPanel = loadMonitoringPanel;
window._cleanupMonitoringPanel = _cleanupMonitoringPanel;
